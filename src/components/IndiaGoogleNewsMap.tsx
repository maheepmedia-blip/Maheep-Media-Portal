import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, Newspaper } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.tsx';
import type { CityItem } from '../types/news.ts';

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];
const INDIA_DEFAULT_CENTER = { lat: 22.5937, lng: 78.9629 };
const DELHI_CENSUS_COORDS = { lat: 28.7041, lng: 77.1025 };

type MarkerAnchor = ReturnType<typeof useAdvancedMarkerRef>[1];

interface CityMarkerPinProps {
  city: CityItem;
  isSelected: boolean;
  onSelect: (city: CityItem, marker: NonNullable<MarkerAnchor>) => void;
}

function CityMarkerPin({ city, isSelected, onSelect }: CityMarkerPinProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const handleClick = useCallback(() => {
    if (marker) {
      onSelect(city, marker);
    }
  }, [city, marker, onSelect]);

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: city.lat, lng: city.lon }}
      title={`${city.name.replace(' (town)', '')}, ${city.state_name}`}
      zIndex={isSelected ? 1000 : city.is_capital ? 500 : 100}
      onClick={handleClick}
    >
      <Pin
        background={isSelected ? '#DF2525' : city.is_capital ? '#00652E' : '#1E293B'}
        borderColor={isSelected ? '#991B1B' : '#FFFFFF'}
        glyphColor="#FFFFFF"
        scale={isSelected ? 1.18 : city.is_capital ? 1.05 : 0.88}
      />
    </AdvancedMarker>
  );
}

function MapCameraSync({ center, zoom }: { center: { lat: number; lng: number }; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    map.setZoom(zoom);
  }, [map, center.lat, center.lng, zoom]);

  return null;
}

function MapsApiStatusGuard({
  children,
  fallbackTitle,
}: {
  children: React.ReactNode;
  fallbackTitle: string;
}) {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300">
        <MapPin className="w-6 h-6 text-[#00652E] mb-2" />
        <p className="text-sm font-semibold">{fallbackTitle}</p>
        <p className="text-xs text-neutral-500 mt-1 max-w-md">
          Interactive Google Maps view could not be loaded right now. Use the regional tile directory or city list to open local stories.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

interface IndiaCityDispatchMapProps {
  cities: CityItem[];
  selectedStateSlug?: string;
  onSelectStateSlug?: (stateSlug: string) => void;
}

function IndiaCityDispatchInner({
  cities,
  selectedStateSlug,
  onSelectStateSlug,
}: IndiaCityDispatchMapProps) {
  const [selectedCity, setSelectedCity] = useState<CityItem | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MarkerAnchor>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const visibleCities = useMemo(() => {
    if (selectedStateSlug) {
      const stateMatches = cities.filter((c) => c.state_slug === selectedStateSlug);
      if (stateMatches.length > 0) return stateMatches.slice(0, 60);
    }
    const capitalsAndMetros = cities.filter((c) => Boolean(c.is_capital) || c.rank <= 45);
    return capitalsAndMetros.slice(0, 65);
  }, [cities, selectedStateSlug]);

  const cameraTarget = useMemo(() => {
    if (selectedStateSlug) {
      const stateCities = cities.filter((c) => c.state_slug === selectedStateSlug);
      const focus = stateCities.find((c) => Boolean(c.is_capital)) || stateCities[0];
      if (focus) {
        return {
          center: { lat: focus.lat, lng: focus.lon },
          zoom: stateCities.length > 1 ? 6 : 8,
        };
      }
    }
    return { center: INDIA_DEFAULT_CENTER, zoom: 5 };
  }, [cities, selectedStateSlug]);

  useEffect(() => {
    setInfoOpen(false);
    setSelectedCity(null);
    setSelectedMarker(null);
  }, [selectedStateSlug]);

  const handleMarkerSelect = useCallback(
    (city: CityItem, marker: NonNullable<MarkerAnchor>) => {
      setSelectedCity(city);
      setSelectedMarker(marker);
      setInfoOpen(true);
      if (city.state_slug && onSelectStateSlug) {
        onSelectStateSlug(city.state_slug);
      }
    },
    [onSelectStateSlug],
  );

  return (
    <MapsApiStatusGuard fallbackTitle="India City Dispatch Map">
      <div className="relative h-[430px] w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={cameraTarget.center}
          defaultZoom={cameraTarget.zoom}
          gestureHandling="cooperative"
          mapTypeControl={true}
          streetViewControl={false}
          fullscreenControl={true}
          internalUsageAttributionIds={ATTRIBUTION_IDS}
          className="h-full w-full"
        >
          <MapCameraSync center={cameraTarget.center} zoom={cameraTarget.zoom} />

          {visibleCities.map((city) => (
            <CityMarkerPin
              key={city.id}
              city={city}
              isSelected={selectedCity?.id === city.id}
              onSelect={handleMarkerSelect}
            />
          ))}

          {infoOpen && selectedCity && selectedMarker && (
            <InfoWindow anchor={selectedMarker} onCloseClick={() => setInfoOpen(false)}>
              <div className="min-w-[210px] max-w-[260px] p-1 text-neutral-900 space-y-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#00652E]">
                    Our Pride · #{selectedCity.rank} India City
                  </div>
                  <h4 className="font-editorial text-base font-bold leading-snug mt-0.5">
                    {selectedCity.name.replace(' (town)', '')}
                    {Boolean(selectedCity.is_capital) ? ' ‡' : ''}
                  </h4>
                  <div className="text-xs text-neutral-600">{selectedCity.state_name}</div>
                </div>

                <div className="text-[11px] font-mono-tabular text-neutral-700 border-y border-neutral-200 py-1.5 flex items-center justify-between gap-2">
                  <span>2011 Pop: {new Intl.NumberFormat('en-IN').format(selectedCity.census_2011)}</span>
                  <span className="font-semibold text-[#00652E]">{selectedCity.article_count ?? 0} reports</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs font-semibold">
                  <Link
                    to={`/epaper?section=our-pride&city=${encodeURIComponent(selectedCity.slug)}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#00652E] text-white hover:bg-[#00451F]"
                  >
                    <Newspaper className="w-3 h-3" /> Our Pride E-Paper
                  </Link>
                  {selectedCity.state_slug && (
                    <Link
                      to={`/states/${selectedCity.state_slug}`}
                      className="text-[#00652E] hover:underline"
                    >
                      State Desk →
                    </Link>
                  )}
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </MapsApiStatusGuard>
  );
}

export function IndiaCityDispatchMap({
  cities,
  selectedStateSlug,
  onSelectStateSlug,
}: IndiaCityDispatchMapProps) {
  const { language } = usePortal();

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-[430px] w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center p-6 text-center">
        <MapPin className="w-6 h-6 text-[#00652E] mb-2" />
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Google Maps API Key Not Configured
        </p>
        <p className="text-xs text-neutral-500 mt-1 max-w-md">
          Set VITE_GOOGLE_MAPS_API_KEY in your environment to enable interactive Google Maps across India’s 28 States, 8 UTs, and 339 Our Pride cities.
        </p>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={['marker']}
      language={language === 'hi' ? 'hi' : 'en'}
      region="IN"
    >
      <IndiaCityDispatchInner
        cities={cities}
        selectedStateSlug={selectedStateSlug}
        onSelectStateSlug={onSelectStateSlug}
      />
    </APIProvider>
  );
}

interface OurPrideCityLocationMapProps {
  activeCity: CityItem;
  allCities: CityItem[];
  onSelectCitySlug: (slug: string) => void;
}

function OurPrideCityLocationInner({
  activeCity,
  allCities,
  onSelectCitySlug,
}: OurPrideCityLocationMapProps) {
  const [infoCity, setInfoCity] = useState<CityItem | null>(null);
  const [infoMarker, setInfoMarker] = useState<MarkerAnchor>(null);

  const nearbyStateCities = useMemo(() => {
    return allCities
      .filter(
        (c) =>
          c.id === activeCity.id ||
          (activeCity.state_name && c.state_name === activeCity.state_name),
      )
      .slice(0, 25);
  }, [allCities, activeCity.id, activeCity.state_name]);

  useEffect(() => {
    setInfoCity(null);
    setInfoMarker(null);
  }, [activeCity.slug]);

  const handleSelect = useCallback(
    (city: CityItem, marker: NonNullable<MarkerAnchor>) => {
      setInfoCity(city);
      setInfoMarker(marker);
    },
    [],
  );

  return (
    <MapsApiStatusGuard fallbackTitle={`${activeCity.name.replace(' (town)', '')} City Locator`}>
      <div className="h-[280px] w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={{ lat: activeCity.lat, lng: activeCity.lon }}
          defaultZoom={10}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={true}
          internalUsageAttributionIds={ATTRIBUTION_IDS}
          className="h-full w-full"
        >
          <MapCameraSync center={{ lat: activeCity.lat, lng: activeCity.lon }} zoom={10} />

          {nearbyStateCities.map((c) => (
            <CityMarkerPin
              key={c.id}
              city={c}
              isSelected={c.id === activeCity.id}
              onSelect={handleSelect}
            />
          ))}

          {infoCity && infoMarker && (
            <InfoWindow anchor={infoMarker} onCloseClick={() => setInfoCity(null)}>
              <div className="min-w-[180px] p-1 text-neutral-900 space-y-1.5">
                <div className="font-editorial text-sm font-bold">
                  {infoCity.name.replace(' (town)', '')}
                </div>
                <div className="text-[11px] text-neutral-600">
                  {infoCity.state_name} · Rank #{infoCity.rank}
                </div>
                {infoCity.slug !== activeCity.slug && (
                  <button
                    type="button"
                    onClick={() => onSelectCitySlug(infoCity.slug)}
                    className="px-2.5 py-1 rounded bg-[#00652E] text-white text-xs font-semibold hover:bg-[#00451F]"
                  >
                    Switch Broadsheet →
                  </button>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </MapsApiStatusGuard>
  );
}

export function OurPrideCityLocationMap(props: OurPrideCityLocationMapProps) {
  const { language } = usePortal();
  if (!GOOGLE_MAPS_API_KEY) return null;

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={['marker']}
      language={language === 'hi' ? 'hi' : 'en'}
      region="IN"
    >
      <OurPrideCityLocationInner {...props} />
    </APIProvider>
  );
}

function EditorialBureauMapInner() {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(true);

  return (
    <MapsApiStatusGuard fallbackTitle="New Delhi Editorial Bureau Map">
      <div className="h-[260px] w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={DELHI_CENSUS_COORDS}
          defaultZoom={11}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={true}
          internalUsageAttributionIds={ATTRIBUTION_IDS}
          className="h-full w-full"
        >
          <AdvancedMarker
            ref={markerRef}
            position={DELHI_CENSUS_COORDS}
            title="Maheep News Portal — New Delhi Editorial Bureau"
            onClick={() => setInfoOpen(true)}
          >
            <Pin background="#00652E" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
          </AdvancedMarker>

          {infoOpen && marker && (
            <InfoWindow anchor={marker} onCloseClick={() => setInfoOpen(false)}>
              <div className="p-1 text-neutral-900 space-y-1 max-w-[220px]">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#00652E]">
                  Editorial Headquarters
                </div>
                <div className="font-editorial text-sm font-bold">Maheep News Portal</div>
                <div className="text-xs text-neutral-600">New Delhi Bureau · National &amp; 36 States/UTs Desk</div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${DELHI_CENSUS_COORDS.lat},${DELHI_CENSUS_COORDS.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#00652E] hover:underline pt-0.5"
                >
                  Open in Google Maps <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </MapsApiStatusGuard>
  );
}

export function EditorialBureauMap() {
  const { language } = usePortal();
  if (!GOOGLE_MAPS_API_KEY) return null;

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={['marker']}
      language={language === 'hi' ? 'hi' : 'en'}
      region="IN"
    >
      <EditorialBureauMapInner />
    </APIProvider>
  );
}
