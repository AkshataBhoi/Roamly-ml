import { OverpassNode } from './osm.service';

export interface MLPlaceFeatures {
  city: string;
  category: string;
  mood: string;
  available_time_min: number;
  distance_km: number;
  visit_duration_min: number;
  preference_match: number;
  is_open: number;
  time_fit: number;
  distance_fit: number;
}

export interface MLPredictionResult {
  suitability_probability: number;
  suitability_class: number;
}

// Typical visit duration estimates in minutes per category based on training patterns
const CATEGORY_VISIT_DURATIONS: Record<string, number> = {
  cafe: 45,
  tea: 30,
  tea_house: 30,
  restaurant: 60,
  food: 60,
  fast_food: 30,
  bakery: 30,
  park: 60,
  garden: 60,
  nature_reserve: 120,
  nature: 90,
  museum: 90,
  gallery: 60,
  historic: 75,
  monument: 45,
  castle: 90,
  ruins: 60,
  viewpoint: 45,
  attraction: 75,
  beach: 90,
  lake: 60,
  sports_centre: 90,
  pitch: 60,
  theme_park: 180,
  zoo: 150,
  theatre: 120,
  cinema: 120,
  library: 60,
  spa: 90,
};

/**
 * Standardize category to match training set categories where possible
 */
export const normalizeCategory = (rawCategory: string): string => {
  const cat = (rawCategory || '').toLowerCase().trim().replace(/[\s_-]+/g, '_');
  if (cat.includes('cafe') || cat.includes('coffee') || cat.includes('tea')) return 'cafe';
  if (cat.includes('restaurant') || cat.includes('food') || cat.includes('bakery') || cat.includes('bar')) return 'restaurant';
  if (cat.includes('park')) return 'park';
  if (cat.includes('garden')) return 'garden';
  if (cat.includes('museum') || cat.includes('gallery')) return 'museum';
  if (cat.includes('monument') || cat.includes('memorial')) return 'monument';
  if (cat.includes('fort') || cat.includes('castle')) return 'fort';
  if (cat.includes('temple') || cat.includes('church') || cat.includes('mosque') || cat.includes('religious')) return 'religious';
  if (cat.includes('viewpoint') || cat.includes('attraction')) return 'viewpoint';
  if (cat.includes('beach')) return 'beach';
  if (cat.includes('lake') || cat.includes('water')) return 'lake';
  if (cat.includes('historic') || cat.includes('ruins')) return 'historic';
  if (cat.includes('nature') || cat.includes('reserve') || cat.includes('zoo')) return 'nature';
  return cat || 'historic';
};

/**
 * Estimate visit duration for a given category with a centralized conservative fallback (60 mins)
 */
export const estimateVisitDuration = (category: string): number => {
  const normalized = normalizeCategory(category);
  return CATEGORY_VISIT_DURATIONS[normalized] ?? 60;
};

/**
 * Extract primary city from location label or address
 */
export const extractCity = (locationLabel: string): string => {
  if (!locationLabel) return 'Mumbai';
  const parts = locationLabel.split(',').map((p) => p.trim());
  return parts[0] || 'Mumbai';
};

/**
 * Build ML features from candidate place and user context
 */
export const buildPlaceFeatures = (
  node: OverpassNode,
  city: string,
  normalizedMood: string,
  availableTimeMin: number,
  searchRadiusMeters: number,
  distKm: number,
  prefScore: number
): MLPlaceFeatures => {
  const rawCat =
    node.tags.amenity ||
    node.tags.tourism ||
    node.tags.leisure ||
    node.tags.historic ||
    node.tags.craft ||
    node.tags.shop ||
    normalizedMood;

  const category = normalizeCategory(rawCat);
  const visitDurationMin = estimateVisitDuration(category);

  // Preference score is 0 to 100+ based on matched terms; normalize smoothly into [0.0, 1.0]
  // If no specific preference terms were queried (prefScore === 0), provide a neutral baseline (0.35)
  // If preference matched, scale proportionally up to 1.0
  const preferenceMatch = prefScore > 0 ? Math.min(1.0, parseFloat((0.4 + (prefScore / 50) * 0.6).toFixed(3))) : 0.35;

  // Check opening status if tags exist, else conservative default 1 (open)
  let isOpen = 1;
  if (node.tags.opening_hours) {
    const hours = node.tags.opening_hours.toLowerCase();
    if (hours === 'closed' || hours.includes('off')) {
      isOpen = 0;
    }
  }

  // time_fit: binary 1 if available time can accommodate the visit duration
  const timeFit = availableTimeMin >= visitDurationMin ? 1 : 0;

  // distance_fit: binary 1 if place distance is within the search radius
  const maxRadiusKm = searchRadiusMeters / 1000;
  const distanceFit = distKm <= maxRadiusKm * 1.05 ? 1 : 0;

  return {
    city,
    category,
    mood: normalizedMood,
    available_time_min: availableTimeMin,
    distance_km: distKm,
    visit_duration_min: visitDurationMin,
    preference_match: preferenceMatch,
    is_open: isOpen,
    time_fit: timeFit,
    distance_fit: distanceFit,
  };
};

/**
 * Execute batch prediction via HTTP ML service (production/Vercel or external microservice)
 */
export const predictSuitabilityBatch = async (
  featuresList: MLPlaceFeatures[],
  timeoutMs: number = 10000
): Promise<MLPredictionResult[] | null> => {
  if (!featuresList || featuresList.length === 0) {
    return [];
  }

  const rawUrl = process.env.ML_SERVICE_URL;
  if (!rawUrl) {
    console.warn('[ML Service] ML_SERVICE_URL is not defined, using fallback.');
    return null;
  }

  let endpointUrl: URL;
  try {
    const cleanUrl = rawUrl.trim();
    if (cleanUrl.includes('https://roamly-ml.onrender.com') || cleanUrl.includes('placeholder')) {
      throw new Error('Placeholder URL detected');
    }
    const baseEndpoint = cleanUrl.endsWith('/predict')
      ? cleanUrl
      : `${cleanUrl.replace(/\/$/, '')}/predict`;
    endpointUrl = new URL(baseEndpoint);
  } catch (err: any) {
    
    console.warn(`[ML Service] Invalid ML_SERVICE_URL configured ("${rawUrl}"). Ensure it is a valid HTTP/HTTPS URL. Error: ${err.message}`);
    return null;
  }

  try {
    const response = await fetch(endpointUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(featuresList),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.warn(`HTTP ML Service failed with status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data && Array.isArray(data.predictions)) {
      return data.predictions;
    }

    return null;
  } catch (error: any) {
    console.warn(`HTTP ML Service at ${endpointUrl} failed:`, error.message);
    return null;
  }
};
