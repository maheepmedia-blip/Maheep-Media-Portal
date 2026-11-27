export interface CountryDirectoryItem {
  slug: string;
  name: string;
  hiName: string;
  region: 'South Asia' | 'Asia-Pacific' | 'Middle East' | 'Europe' | 'Americas' | 'Africa';
  capital: string;
  gl: string;
  ceid: string;
  commonsQuery: string;
}

export const COUNTRIES_DIRECTORY: readonly CountryDirectoryItem[] = [
  // South Asia (including India National)
  { slug: 'india', name: 'India', hiName: 'भारत', region: 'South Asia', capital: 'New Delhi', gl: 'IN', ceid: 'IN:en', commonsQuery: 'New Parliament Building New Delhi' },
  { slug: 'bangladesh', name: 'Bangladesh', hiName: 'बांग्लादेश', region: 'South Asia', capital: 'Dhaka', gl: 'IN', ceid: 'IN:en', commonsQuery: 'Dhaka Bangladesh skyline' },
  { slug: 'sri-lanka', name: 'Sri Lanka', hiName: 'श्रीलंका', region: 'South Asia', capital: 'Colombo', gl: 'IN', ceid: 'IN:en', commonsQuery: 'Colombo Sri Lanka city' },
  { slug: 'nepal', name: 'Nepal', hiName: 'नेपाल', region: 'South Asia', capital: 'Kathmandu', gl: 'IN', ceid: 'IN:en', commonsQuery: 'Kathmandu Nepal valley' },
  { slug: 'bhutan', name: 'Bhutan', hiName: 'भूटान', region: 'South Asia', capital: 'Thimphu', gl: 'IN', ceid: 'IN:en', commonsQuery: 'Thimphu Bhutan' },
  { slug: 'maldives', name: 'Maldives', hiName: 'मालदीव', region: 'South Asia', capital: 'Male', gl: 'IN', ceid: 'IN:en', commonsQuery: 'Male Maldives city' },
  { slug: 'pakistan', name: 'Pakistan', hiName: 'पाकिस्तान', region: 'South Asia', capital: 'Islamabad', gl: 'US', ceid: 'US:en', commonsQuery: 'Islamabad Pakistan architecture' },

  // Asia-Pacific
  { slug: 'china', name: 'China', hiName: 'चीन', region: 'Asia-Pacific', capital: 'Beijing', gl: 'US', ceid: 'US:en', commonsQuery: 'Beijing China skyline' },
  { slug: 'japan', name: 'Japan', hiName: 'जापान', region: 'Asia-Pacific', capital: 'Tokyo', gl: 'US', ceid: 'US:en', commonsQuery: 'Tokyo Japan skyline' },
  { slug: 'south-korea', name: 'South Korea', hiName: 'दक्षिण कोरिया', region: 'Asia-Pacific', capital: 'Seoul', gl: 'US', ceid: 'US:en', commonsQuery: 'Seoul South Korea skyline' },
  { slug: 'singapore', name: 'Singapore', hiName: 'सिंगापुर', region: 'Asia-Pacific', capital: 'Singapore', gl: 'SG', ceid: 'SG:en', commonsQuery: 'Singapore Marina Bay skyline' },
  { slug: 'australia', name: 'Australia', hiName: 'ऑस्ट्रेलिया', region: 'Asia-Pacific', capital: 'Canberra', gl: 'AU', ceid: 'AU:en', commonsQuery: 'Sydney Australia harbour' },
  { slug: 'new-zealand', name: 'New Zealand', hiName: 'न्यूज़ीलैंड', region: 'Asia-Pacific', capital: 'Wellington', gl: 'NZ', ceid: 'NZ:en', commonsQuery: 'Auckland New Zealand skyline' },
  { slug: 'indonesia', name: 'Indonesia', hiName: 'इंडोनेशिया', region: 'Asia-Pacific', capital: 'Jakarta', gl: 'US', ceid: 'US:en', commonsQuery: 'Jakarta Indonesia skyline' },
  { slug: 'malaysia', name: 'Malaysia', hiName: 'मलेशिया', region: 'Asia-Pacific', capital: 'Kuala Lumpur', gl: 'MY', ceid: 'MY:en', commonsQuery: 'Kuala Lumpur Malaysia skyline' },
  { slug: 'thailand', name: 'Thailand', hiName: 'थाईलैंड', region: 'Asia-Pacific', capital: 'Bangkok', gl: 'US', ceid: 'US:en', commonsQuery: 'Bangkok Thailand skyline' },
  { slug: 'vietnam', name: 'Vietnam', hiName: 'वियतनाम', region: 'Asia-Pacific', capital: 'Hanoi', gl: 'US', ceid: 'US:en', commonsQuery: 'Hanoi Vietnam city' },
  { slug: 'philippines', name: 'Philippines', hiName: 'फिलीपींस', region: 'Asia-Pacific', capital: 'Manila', gl: 'PH', ceid: 'PH:en', commonsQuery: 'Manila Philippines skyline' },
  { slug: 'taiwan', name: 'Taiwan', hiName: 'ताइवान', region: 'Asia-Pacific', capital: 'Taipei', gl: 'US', ceid: 'US:en', commonsQuery: 'Taipei Taiwan skyline' },

  // Middle East
  { slug: 'united-arab-emirates', name: 'United Arab Emirates', hiName: 'संयुक्त अरब अमीरात', region: 'Middle East', capital: 'Abu Dhabi', gl: 'AE', ceid: 'AE:en', commonsQuery: 'Dubai UAE skyline' },
  { slug: 'saudi-arabia', name: 'Saudi Arabia', hiName: 'सऊदी अरब', region: 'Middle East', capital: 'Riyadh', gl: 'US', ceid: 'US:en', commonsQuery: 'Riyadh Saudi Arabia skyline' },
  { slug: 'israel', name: 'Israel', hiName: 'इज़राइल', region: 'Middle East', capital: 'Jerusalem', gl: 'US', ceid: 'US:en', commonsQuery: 'Tel Aviv Israel skyline' },
  { slug: 'iran', name: 'Iran', hiName: 'ईरान', region: 'Middle East', capital: 'Tehran', gl: 'US', ceid: 'US:en', commonsQuery: 'Tehran Iran city' },
  { slug: 'qatar', name: 'Qatar', hiName: 'कतर', region: 'Middle East', capital: 'Doha', gl: 'US', ceid: 'US:en', commonsQuery: 'Doha Qatar skyline' },
  { slug: 'turkey', name: 'Turkey', hiName: 'तुर्की', region: 'Middle East', capital: 'Ankara', gl: 'US', ceid: 'US:en', commonsQuery: 'Istanbul Turkey skyline' },

  // Europe
  { slug: 'united-kingdom', name: 'United Kingdom', hiName: 'ब्रिटेन', region: 'Europe', capital: 'London', gl: 'GB', ceid: 'GB:en', commonsQuery: 'London United Kingdom Westminster' },
  { slug: 'france', name: 'France', hiName: 'फ्रांस', region: 'Europe', capital: 'Paris', gl: 'US', ceid: 'US:en', commonsQuery: 'Paris France skyline' },
  { slug: 'germany', name: 'Germany', hiName: 'जर्मनी', region: 'Europe', capital: 'Berlin', gl: 'US', ceid: 'US:en', commonsQuery: 'Berlin Germany Reichstag' },
  { slug: 'italy', name: 'Italy', hiName: 'इटली', region: 'Europe', capital: 'Rome', gl: 'US', ceid: 'US:en', commonsQuery: 'Rome Italy architecture' },
  { slug: 'spain', name: 'Spain', hiName: 'स्पेन', region: 'Europe', capital: 'Madrid', gl: 'US', ceid: 'US:en', commonsQuery: 'Madrid Spain city' },
  { slug: 'russia', name: 'Russia', hiName: 'रूस', region: 'Europe', capital: 'Moscow', gl: 'US', ceid: 'US:en', commonsQuery: 'Moscow Russia Kremlin' },
  { slug: 'ukraine', name: 'Ukraine', hiName: 'यूक्रेन', region: 'Europe', capital: 'Kyiv', gl: 'US', ceid: 'US:en', commonsQuery: 'Kyiv Ukraine city' },
  { slug: 'netherlands', name: 'Netherlands', hiName: 'नीदरलैंड', region: 'Europe', capital: 'Amsterdam', gl: 'US', ceid: 'US:en', commonsQuery: 'Amsterdam Netherlands canals' },
  { slug: 'switzerland', name: 'Switzerland', hiName: 'स्विट्ज़रलैंड', region: 'Europe', capital: 'Bern', gl: 'US', ceid: 'US:en', commonsQuery: 'Geneva Switzerland city' },
  { slug: 'poland', name: 'Poland', hiName: 'पोलैंड', region: 'Europe', capital: 'Warsaw', gl: 'US', ceid: 'US:en', commonsQuery: 'Warsaw Poland skyline' },
  { slug: 'sweden', name: 'Sweden', hiName: 'स्वीडन', region: 'Europe', capital: 'Stockholm', gl: 'US', ceid: 'US:en', commonsQuery: 'Stockholm Sweden city' },
  { slug: 'ireland', name: 'Ireland', hiName: 'आयरलैंड', region: 'Europe', capital: 'Dublin', gl: 'IE', ceid: 'IE:en', commonsQuery: 'Dublin Ireland city' },

  // Americas
  { slug: 'united-states', name: 'United States', hiName: 'अमेरिका', region: 'Americas', capital: 'Washington, D.C.', gl: 'US', ceid: 'US:en', commonsQuery: 'United States Capitol Washington DC' },
  { slug: 'canada', name: 'Canada', hiName: 'कनाडा', region: 'Americas', capital: 'Ottawa', gl: 'CA', ceid: 'CA:en', commonsQuery: 'Ottawa Canada Parliament' },
  { slug: 'brazil', name: 'Brazil', hiName: 'ब्राज़ील', region: 'Americas', capital: 'Brasilia', gl: 'US', ceid: 'US:en', commonsQuery: 'Sao Paulo Brazil skyline' },
  { slug: 'mexico', name: 'Mexico', hiName: 'मेक्सिको', region: 'Americas', capital: 'Mexico City', gl: 'US', ceid: 'US:en', commonsQuery: 'Mexico City skyline' },
  { slug: 'argentina', name: 'Argentina', hiName: 'अर्जेंटीना', region: 'Americas', capital: 'Buenos Aires', gl: 'US', ceid: 'US:en', commonsQuery: 'Buenos Aires Argentina skyline' },
  { slug: 'chile', name: 'Chile', hiName: 'चिली', region: 'Americas', capital: 'Santiago', gl: 'US', ceid: 'US:en', commonsQuery: 'Santiago Chile skyline' },

  // Africa
  { slug: 'south-africa', name: 'South Africa', hiName: 'दक्षिण अफ्रीका', region: 'Africa', capital: 'Pretoria', gl: 'ZA', ceid: 'ZA:en', commonsQuery: 'Cape Town South Africa skyline' },
  { slug: 'egypt', name: 'Egypt', hiName: 'मिस्र', region: 'Africa', capital: 'Cairo', gl: 'US', ceid: 'US:en', commonsQuery: 'Cairo Egypt skyline' },
  { slug: 'nigeria', name: 'Nigeria', hiName: 'नाइजीरिया', region: 'Africa', capital: 'Abuja', gl: 'NG', ceid: 'NG:en', commonsQuery: 'Lagos Nigeria skyline' },
  { slug: 'kenya', name: 'Kenya', hiName: 'केन्या', region: 'Africa', capital: 'Nairobi', gl: 'KE', ceid: 'KE:en', commonsQuery: 'Nairobi Kenya skyline' },
  { slug: 'ethiopia', name: 'Ethiopia', hiName: 'इथियोपिया', region: 'Africa', capital: 'Addis Ababa', gl: 'US', ceid: 'US:en', commonsQuery: 'Addis Ababa Ethiopia' },
  { slug: 'morocco', name: 'Morocco', hiName: 'मोरक्को', region: 'Africa', capital: 'Rabat', gl: 'US', ceid: 'US:en', commonsQuery: 'Casablanca Morocco city' },
  { slug: 'ghana', name: 'Ghana', hiName: 'घाना', region: 'Africa', capital: 'Accra', gl: 'GH', ceid: 'GH:en', commonsQuery: 'Accra Ghana city' },
];

export function findCountryBySlug(slug: string): CountryDirectoryItem | undefined {
  return COUNTRIES_DIRECTORY.find((c) => c.slug === slug);
}
