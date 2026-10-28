import type { Place } from './types';

export type { LatLng, Place } from './types';

/** M1 place list: the ten seed cities plus pickup areas used in the mockups. M2 swaps search for Photon. */
export const CITIES: (Place & { slug: string })[] = [
  { slug: 'delhi', label: 'Delhi', lat: 28.6139, lng: 77.209 },
  { slug: 'gurugram', label: 'Gurugram', lat: 28.4595, lng: 77.0266 },
  { slug: 'noida', label: 'Noida', lat: 28.5355, lng: 77.391 },
  { slug: 'chandigarh', label: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { slug: 'jaipur', label: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { slug: 'agra', label: 'Agra', lat: 27.1767, lng: 78.0081 },
  { slug: 'amritsar', label: 'Amritsar', lat: 31.634, lng: 74.8723 },
  { slug: 'dehradun', label: 'Dehradun', lat: 30.3165, lng: 78.0322 },
  { slug: 'shimla', label: 'Shimla', lat: 31.1048, lng: 77.1734 },
  { slug: 'ludhiana', label: 'Ludhiana', lat: 30.901, lng: 75.8573 },
  { slug: 'dhaula-kuan', label: 'Dhaula Kuan (Delhi)', lat: 28.5922, lng: 77.1613 },
  { slug: 'kashmere-gate', label: 'Kashmere Gate ISBT (Delhi)', lat: 28.6677, lng: 77.2285 },
  { slug: 'rajiv-chowk-gurugram', label: 'Rajiv Chowk (Gurugram)', lat: 28.4601, lng: 77.0263 },
  { slug: 'sindhi-camp', label: 'Sindhi Camp (Jaipur)', lat: 26.9199, lng: 75.7878 },
  { slug: 'isbt-43-chandigarh', label: 'ISBT Sector 43 (Chandigarh)', lat: 30.7197, lng: 76.7456 },
];

/** The ten towns (not pickup areas) that popular routes are grouped by. */
export const ROUTE_CITY_SLUGS = [
  'delhi',
  'gurugram',
  'noida',
  'chandigarh',
  'jaipur',
  'agra',
  'amritsar',
  'dehradun',
  'shimla',
  'ludhiana',
] as const;

export const ROUTE_CITIES = CITIES.filter((c) => (ROUTE_CITY_SLUGS as readonly string[]).includes(c.slug));

const MAX_LIST_RESULTS = 8;

/** M1 matching over the fixed list: label-prefix matches first, then substring matches, each alphabetical. */
export function searchCityList(q: string): Place[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const prefix: Place[] = [];
  const inside: Place[] = [];
  for (const { label, lat, lng } of CITIES) {
    const at = label.toLowerCase().indexOf(needle);
    if (at === 0) prefix.push({ label, lat, lng });
    else if (at > 0) inside.push({ label, lat, lng });
  }
  const byLabel = (a: Place, b: Place) => a.label.localeCompare(b.label);
  return [...prefix.sort(byLabel), ...inside.sort(byLabel)].slice(0, MAX_LIST_RESULTS);
}
