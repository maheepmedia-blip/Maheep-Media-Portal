export interface IndianCityPreset {
  name: string;
  state: string;
  lat: number;
  lon: number;
}

export const MAJOR_INDIAN_CITIES: IndianCityPreset[] = [
  { name: 'New Delhi', state: 'Delhi', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lon: 72.8777 },
  { name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lon: 77.5946 },
  { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lon: 88.3639 },
  { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lon: 80.2707 },
  { name: 'Hyderabad', state: 'Telangana', lat: 17.385, lon: 78.4867 },
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lon: 75.7873 },
  { name: 'Patna', state: 'Bihar', lat: 25.5941, lon: 85.1376 },
  { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lon: 77.4126 },
  { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lon: 72.5714 },
  { name: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lon: 76.7794 },
];

export type WeatherConditionKind = 'clear' | 'partly_cloudy' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow';

export interface WeatherForecastDay {
  date: string;
  dayLabel: string;
  tempMax: number;
  tempMin: number;
  condition: string;
  kind: WeatherConditionKind;
  rainChance: number;
}

export interface WeatherPayload {
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
    kind: WeatherConditionKind;
  };
  forecast: WeatherForecastDay[];
  cities: Array<{ name: string; state: string }>;
}

function mapWmoCode(code: number): { condition: string; kind: WeatherConditionKind } {
  if (code === 0) return { condition: 'Clear Sky', kind: 'clear' };
  if (code === 1 || code === 2) return { condition: 'Partly Cloudy', kind: 'partly_cloudy' };
  if (code === 3) return { condition: 'Overcast', kind: 'cloudy' };
  if (code === 45 || code === 48) return { condition: 'Fog / Mist', kind: 'fog' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { condition: 'Rain Showers', kind: 'rain' };
  if (code >= 71 && code <= 86) return { condition: 'Snow / Frost', kind: 'snow' };
  if (code >= 95) return { condition: 'Thunderstorm', kind: 'storm' };
  return { condition: 'Fair Weather', kind: 'partly_cloudy' };
}

interface CacheEntry {
  expiresAt: number;
  payload: WeatherPayload;
}

const weatherCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60_000;

async function resolveLocationLabel(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&localityLanguage=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return 'Your Location';
    const data = (await res.json()) as { city?: string; locality?: string; principalSubdivision?: string };
    const place = data.city || data.locality || data.principalSubdivision;
    return place ? String(place) : 'Your Location';
  } catch {
    return 'Your Location';
  }
}

export async function getWeatherForecast(options: {
  city?: string;
  lat?: number;
  lon?: number;
}): Promise<WeatherPayload> {
  let lat: number;
  let lon: number;
  let locationName: string;
  let isUserLocation = false;

  if (
    typeof options.lat === 'number' &&
    typeof options.lon === 'number' &&
    Number.isFinite(options.lat) &&
    Number.isFinite(options.lon) &&
    options.lat >= -90 &&
    options.lat <= 90 &&
    options.lon >= -180 &&
    options.lon <= 180
  ) {
    lat = Number(options.lat.toFixed(3));
    lon = Number(options.lon.toFixed(3));
    isUserLocation = true;
    locationName = 'Your Location';
  } else {
    const requested = (options.city || 'New Delhi').trim().toLowerCase();
    const matched =
      MAJOR_INDIAN_CITIES.find((c) => c.name.toLowerCase() === requested) || MAJOR_INDIAN_CITIES[0];
    lat = matched.lat;
    lon = matched.lon;
    locationName = matched.name;
  }

  const cacheKey = `${lat},${lon}:${isUserLocation ? 'geo' : locationName}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const apiUrl = new URL('https://api.open-meteo.com/v1/forecast');
  apiUrl.searchParams.set('latitude', String(lat));
  apiUrl.searchParams.set('longitude', String(lon));
  apiUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
  );
  apiUrl.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  );
  apiUrl.searchParams.set('timezone', 'Asia/Kolkata');
  apiUrl.searchParams.set('forecast_days', '5');

  const [weatherRes, resolvedLabel] = await Promise.all([
    fetch(apiUrl.toString(), { signal: AbortSignal.timeout(8000) }),
    isUserLocation ? resolveLocationLabel(lat, lon) : Promise.resolve(locationName),
  ]);

  if (!weatherRes.ok) {
    throw new Error(`Weather upstream returned HTTP ${weatherRes.status}`);
  }

  const data = (await weatherRes.json()) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      relative_humidity_2m?: number;
      wind_speed_10m?: number;
      weather_code?: number;
    };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
    };
  };

  const cur = data.current || {};
  const curMapped = mapWmoCode(Number(cur.weather_code ?? 0));

  const dailyTimes = data.daily?.time || [];
  const forecast: WeatherForecastDay[] = dailyTimes.map((dateStr, idx) => {
    const code = Number(data.daily?.weather_code?.[idx] ?? 0);
    const mapped = mapWmoCode(code);
    const dayLabel =
      idx === 0
        ? 'Today'
        : new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
          }).format(new Date(`${dateStr}T12:00:00+05:30`));

    return {
      date: dateStr,
      dayLabel,
      tempMax: Math.round(Number(data.daily?.temperature_2m_max?.[idx] ?? 0)),
      tempMin: Math.round(Number(data.daily?.temperature_2m_min?.[idx] ?? 0)),
      condition: mapped.condition,
      kind: mapped.kind,
      rainChance: Math.round(Number(data.daily?.precipitation_probability_max?.[idx] ?? 0)),
    };
  });

  const payload: WeatherPayload = {
    locationName: resolvedLabel,
    latitude: lat,
    longitude: lon,
    isUserLocation,
    updatedAt: new Date().toISOString(),
    current: {
      temperature: Math.round(Number(cur.temperature_2m ?? 0)),
      feelsLike: Math.round(Number(cur.apparent_temperature ?? cur.temperature_2m ?? 0)),
      humidity: Math.round(Number(cur.relative_humidity_2m ?? 0)),
      windSpeed: Math.round(Number(cur.wind_speed_10m ?? 0)),
      condition: curMapped.condition,
      kind: curMapped.kind,
    },
    forecast,
    cities: MAJOR_INDIAN_CITIES.map((c) => ({ name: c.name, state: c.state })),
  };

  weatherCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}
