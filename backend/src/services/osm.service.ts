import axios from 'axios';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

// Primary & fallback public Overpass endpoints to handle timeouts and 503 errors gracefully
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export const API_HEADERS = {
  'User-Agent': 'RoamlyApp/1.0 (Student Project)',
};

export interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
}

export const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
  try {
    const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
      params: {
        q: address,
        format: 'json',
        limit: 1,
      },
      headers: API_HEADERS,
      timeout: 10000,
    });

    if (response.data && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch (error: any) {
    console.error('Error in geocodeAddress:', error?.message || error);
    const err: any = new Error('Failed to geocode address');
    err.isUpstream = true;
    err.code = error?.code;
    err.status = error?.response?.status;
    throw err;
  }
};

export const reverseGeocode = async (lat: number, lon: number): Promise<string | null> => {
  try {
    const response = await axios.get(`${NOMINATIM_BASE_URL}/reverse`, {
      params: {
        lat,
        lon,
        format: 'json',
      },
      headers: API_HEADERS,
      timeout: 10000,
    });

    if (response.data && response.data.display_name) {
      return response.data.display_name;
    }
    return null;
  } catch (error: any) {
    console.error('Error in reverseGeocode:', error?.message || error);
    const err: any = new Error('Failed to reverse geocode coordinates');
    err.isUpstream = true;
    err.code = error?.code;
    err.status = error?.response?.status;
    throw err;
  }
};

export interface OverpassNode {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface MoodFilterConfig {
  amenity?: string[];
  tourism?: string[];
  leisure?: string[];
  historic?: string[];
  craft?: string[];
  shop?: string[];
}

/**
 * Maps frontend mood options to comprehensive OpenStreetMap multi-tag filters
 */
export const getAmenitiesForMood = (mood: string): MoodFilterConfig => {
  const normalizedMood = (mood || '').toLowerCase().trim();

  switch (normalizedMood) {
    case 'relax':
    case 'relaxed':
      return {
        amenity: ['cafe', 'library', 'spa', 'tea_house'],
        leisure: ['park', 'garden', 'nature_reserve'],
      };

    case 'explore':
      return {
        tourism: ['artwork', 'attraction', 'viewpoint'],
        amenity: ['marketplace', 'bookshop'],
        leisure: ['park'],
      };

    case 'nature':
      return {
        leisure: ['park', 'garden', 'nature_reserve'],
        tourism: ['viewpoint', 'campsite'],
      };

    case 'food':
    case 'hungry':
      return {
        amenity: ['restaurant', 'cafe', 'food_court', 'fast_food', 'pub', 'ice_cream', 'bakery'],
      };

    case 'adventure':
    case 'adventurous':
      return {
        leisure: ['sports_centre', 'pitch', 'track', 'playground'],
        tourism: ['theme_park', 'zoo'],
      };

    case 'culture':
    case 'cultured':
      return {
        tourism: ['museum', 'gallery', 'attraction'],
        historic: ['monument', 'castle', 'ruins', 'memorial'],
        amenity: ['theatre', 'arts_centre', 'cinema'],
      };

    default:
      return {
        amenity: ['cafe', 'restaurant'],
        leisure: ['park', 'garden'],
        tourism: ['attraction', 'viewpoint'],
      };
  }
};

/**
 * Fetches nearby places from Overpass API across multiple tag keys with mirror fallbacks
 */
export const searchNearbyPlaces = async (
  lat: number,
  lon: number,
  radius: number, // in meters
  filterConfig: MoodFilterConfig | string[]
): Promise<OverpassNode[]> => {
  let config: MoodFilterConfig;
  if (Array.isArray(filterConfig)) {
    config = { amenity: filterConfig };
  } else {
    config = filterConfig;
  }

  const clauses: string[] = [];
  const tagEntries: Array<[keyof MoodFilterConfig, string[] | undefined]> = [
    ['amenity', config.amenity],
    ['tourism', config.tourism],
    ['leisure', config.leisure],
    ['historic', config.historic],
    ['craft', config.craft],
    ['shop', config.shop],
  ];

  for (const [tagKey, values] of tagEntries) {
    if (values && values.length > 0) {
      const regex = values.join('|');
      clauses.push(`node["${tagKey}"~"^(${regex})$"](around:${radius},${lat},${lon});`);
      clauses.push(`way["${tagKey}"~"^(${regex})$"](around:${radius},${lat},${lon});`);
    }
  }

  if (clauses.length === 0) {
    clauses.push(`node["amenity"](around:${radius},${lat},${lon});`);
  }

  const query = `
    [out:json][timeout:30];
    (
      ${clauses.join('\n      ')}
    );
    out center 40;
  `;

  // Try endpoints sequentially in case of rate limits or 503 timeouts
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await axios.post(endpoint, `data=${encodeURIComponent(query)}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': API_HEADERS['User-Agent'],
          'Accept': 'application/json',
        },
        timeout: 35000,
      });

      if (response.data && Array.isArray(response.data.elements)) {
        const elements: OverpassNode[] = response.data.elements
          .filter((el: any) => el && el.tags && (el.tags.name || el.tags['name:en']))
          .map((el: any) => ({
            id: el.id,
            lat: Number(typeof el.lat === 'number' ? el.lat : el.center?.lat),
            lon: Number(typeof el.lon === 'number' ? el.lon : el.center?.lon),
            tags: el.tags,
          }))
          .filter((el: OverpassNode) => !isNaN(el.lat) && !isNaN(el.lon));

        return elements;
      }
    } catch (error: any) {
      console.warn(`Overpass endpoint failed (${endpoint}):`, error.message || error);
    }
  }

  // If all Overpass servers fail, flag upstream error for HTTP 503 response
  const upstreamErr = new Error('Overpass API timeout or network error');
  (upstreamErr as any).isUpstream = true;
  throw upstreamErr;
};