import {
  ChevronDown,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  LocateFixed,
  MapPin,
  Sun,
  Wind,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type WeatherKind = 'clear' | 'partly_cloudy' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow';

interface WeatherForecastDay {
  date: string;
  dayLabel: string;
  tempMax: number;
  tempMin: number;
  condition: string;
  kind: WeatherKind;
  rainChance: number;
}

interface WeatherResponse {
  locationName: string;
  latitude: number;
  longitude: number;
  isUserLocation: boolean;
  updatedAt: string;
  current: {
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    condition: string;
    kind: WeatherKind;
  };
  forecast: WeatherForecastDay[];
  cities: Array<{ name: string; state: string }>;
}

const STORAGE_KEY = 'maheep_weather_pref';

function WeatherIcon({ kind, className = 'w-4 h-4' }: { kind: WeatherKind; className?: string }) {
  switch (kind) {
    case 'clear':
      return <Sun className={`${className} text-amber-500`} />;
    case 'partly_cloudy':
      return <CloudSun className={`${className} text-amber-500`} />;
    case 'cloudy':
      return <Cloud className={`${className} text-neutral-500 dark:text-neutral-400`} />;
    case 'fog':
      return <CloudFog className={`${className} text-neutral-500 dark:text-neutral-400`} />;
    case 'rain':
      return <CloudRain className={`${className} text-sky-600 dark:text-sky-400`} />;
    case 'storm':
      return <CloudLightning className={`${className} text-indigo-600 dark:text-indigo-400`} />;
    case 'snow':
      return <CloudSnow className={`${className} text-sky-400`} />;
    default:
      return <CloudSun className={`${className} text-amber-500`} />;
  }
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const loadWeather = useCallback(async (params: { city?: string; lat?: number; lon?: number }) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const qs = new URLSearchParams();
      if (typeof params.lat === 'number' && typeof params.lon === 'number') {
        qs.set('lat', String(params.lat));
        qs.set('lon', String(params.lon));
      } else {
        qs.set('city', params.city || 'New Delhi');
      }
      const res = await fetch(`/api/weather?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Weather unavailable');
      setWeather(json);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch weather');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { city?: string; lat?: number; lon?: number };
        if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
          void loadWeather({ lat: parsed.lat, lon: parsed.lon });
          return;
        }
        if (parsed.city) {
          void loadWeather({ city: parsed.city });
          return;
        }
      }
    } catch {
      // Fallback to New Delhi
    }
    void loadWeather({ city: 'New Delhi' });
  }, [loadWeather]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const selectCity = (cityName: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ city: cityName }));
    } catch {
      // ignore storage errors
    }
    void loadWeather({ city: cityName });
  };

  const detectMyLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Browser geolocation is unavailable. Select a city below.');
      return;
    }
    setLocating(true);
    setErrorMsg('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lon }));
        } catch {
          // ignore
        }
        void loadWeather({ lat, lon }).finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setErrorMsg('Location permission declined. Showing selected Indian city instead.');
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open live weather and 5-day forecast"
        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-[#00652E] transition-colors text-xs text-neutral-800 dark:text-neutral-200 whitespace-nowrap"
      >
        {weather ? (
          <>
            <WeatherIcon kind={weather.current.kind} className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold">{weather.locationName}</span>
            <span className="font-mono-tabular font-bold text-[#00652E] dark:text-[#4ade80]">
              {weather.current.temperature}°C
            </span>
            <span className="hidden xl:inline text-neutral-500 dark:text-neutral-400">
              {weather.current.condition}
            </span>
          </>
        ) : (
          <span className="text-neutral-500">{loading ? 'Weather...' : 'India Weather'}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-[320px] sm:w-[390px] z-50 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-4 space-y-4">
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">
                <MapPin className="w-3.5 h-3.5" />
                <span>{weather?.locationName || 'New Delhi'}</span>
              </div>
              {weather && (
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="font-mono-tabular text-3xl font-bold text-neutral-950 dark:text-white">
                    {weather.current.temperature}°C
                  </span>
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    {weather.current.condition} · Feels {weather.current.feelsLike}°C
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={detectMyLocation}
              disabled={locating}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#00652E]/40 bg-[#EAF5E5]/60 dark:bg-[#00451F]/40 text-[#00451F] dark:text-[#EAF5E5] text-[11px] font-semibold hover:bg-[#EAF5E5] whitespace-nowrap"
            >
              <LocateFixed className={`w-3 h-3 ${locating ? 'animate-spin' : ''}`} />
              {locating ? 'Locating...' : 'My Location'}
            </button>
          </div>

          {errorMsg && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2.5 py-1.5">
              {errorMsg}
            </div>
          )}

          {weather && (
            <>
              <div className="grid grid-cols-3 gap-2 text-xs bg-neutral-50 dark:bg-neutral-950/60 rounded p-2.5 border border-neutral-200/70 dark:border-neutral-800">
                <div className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-sky-600" />
                  <div>
                    <div className="text-[10px] text-neutral-500">Humidity</div>
                    <div className="font-mono-tabular font-semibold">{weather.current.humidity}%</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-[#00652E]" />
                  <div>
                    <div className="text-[10px] text-neutral-500">Wind</div>
                    <div className="font-mono-tabular font-semibold">{weather.current.windSpeed} km/h</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500">Today H / L</div>
                  <div className="font-mono-tabular font-semibold">
                    {weather.forecast[0]?.tempMax ?? '--'}° / {weather.forecast[0]?.tempMin ?? '--'}°
                  </div>
                </div>
              </div>

              {/* 5-Day Forecast */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  5-Day Forecast (IST)
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {weather.forecast.slice(0, 5).map((day) => (
                    <div
                      key={day.date}
                      className="p-2 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex flex-col items-center gap-1"
                    >
                      <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                        {day.dayLabel}
                      </span>
                      <WeatherIcon kind={day.kind} className="w-4 h-4" />
                      <span className="font-mono-tabular text-[11px] font-bold">
                        {day.tempMax}° <span className="text-neutral-400 font-normal">{day.tempMin}°</span>
                      </span>
                      <span className="text-[10px] text-sky-600 dark:text-sky-400 font-mono-tabular">
                        {day.rainChance}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Major Indian Cities Switcher */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  Major Indian Cities
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {weather.cities.map((c) => {
                    const active = !weather.isUserLocation && weather.locationName === c.name;
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => selectCity(c.name)}
                        className={`px-2 py-1.5 rounded text-[11px] font-medium text-left truncate transition-colors border ${
                          active
                            ? 'bg-[#00652E] text-white border-[#00652E]'
                            : 'bg-neutral-50 dark:bg-neutral-800/70 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-[#00652E]'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
