import { Place, RecommendationQuery } from "../types";

// Safe environment API URL resolution:
// Same-origin /api is preferred because frontend and backend live under the same domain.
// http://localhost:5000/api must NEVER be used by the deployed browser.
export const getApiBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

    // Deployed production browser must NEVER call localhost
    if (!isLocalhost) {
      const customUrl = process.env.NEXT_PUBLIC_API_URL;
      if (customUrl && !customUrl.includes("localhost") && !customUrl.includes("127.0.0.1")) {
        return customUrl.replace(/\/$/, "");
      }
      return "/api";
    }

    // On local machine, if an external non-port-5000 URL is specified use it, otherwise use unified same-origin /api
    const customUrl = process.env.NEXT_PUBLIC_API_URL;
    if (customUrl && !customUrl.includes(":5000")) {
      return customUrl.replace(/\/$/, "");
    }
    return "/api";
  }

  return "/api";
};

export interface IRecommendationService {
  getRecommendations(query: RecommendationQuery): Promise<Place[]>;
  getPlaceById(id: string): Promise<Place | undefined>;
  geocodeAddress(address: string): Promise<{ latitude: number; longitude: number; address: string } | null>;
  reverseGeocode(lat: number, lng: number): Promise<string | null>;
}

// Helper to map UI time string to backend's required format
const mapTimeToBackendFormat = (timeStr: string): string => {
  const normalized = (timeStr || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized.includes('30m') || normalized.includes('30min')) return '30min';
  if (normalized.includes('1h') || normalized.includes('1hour') || normalized === '1') return '1_hour';
  if (normalized.includes('3h') || normalized.includes('3hour') || normalized === '3') return '3_hours';
  if (normalized.includes('half')) return 'half_day';
  if (normalized.includes('full')) return 'full_day';
  return timeStr || '3_hours';
}; 

class RecommendationService implements IRecommendationService {

async getRecommendations(query: RecommendationQuery): Promise<Place[]> {
  try {
    const { time, mood, preferenceText, latitude, longitude, location } = query;
    
    const lat = latitude ?? 40.7128;
    const lng = longitude ?? -74.0060;

    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude: Number(lat),
        longitude: Number(lng),
        availableTime: mapTimeToBackendFormat(time || '3h'),
        mood: mood || 'relax',
        preferenceText: preferenceText || "",
        preferences: preferenceText || "",
        location: location || "",
      }),
    });

    if (!response.ok) {
      let serverErrorMessage = `Server error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson && errorJson.error) {
          serverErrorMessage = errorJson.error;
        }
      } catch {
        // Ignore json parse failure on error response
      }
      const err = new Error(serverErrorMessage);
      (err as any).status = response.status;
      throw err;
    }

    const data = await response.json();
    const placesArray = data.places || [];

    return placesArray.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category || "Point of Interest",
      categoryEmoji: p.categoryEmoji || "📍",
      rating: p.rating || 4.5,
      distance: p.distance || "Nearby",
      visitDuration: p.visitDuration || time,
      description: p.description || "",
      matchScore: p.matchScore !== undefined && p.matchScore !== null ? p.matchScore : 85,
      matchReason: p.matchReason || `Matches your ${mood} mood perfectly.`,
      image: p.image || p.imageUrl || "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&fit=crop&auto=format",
      bestFor: p.bestFor || [mood, p.category].filter(Boolean),
      latitude: p.latitude ?? p.coordinates?.lat ?? p.coordinates?.y ?? lat,
      longitude: p.longitude ?? p.coordinates?.lng ?? p.coordinates?.x ?? lng,
      coordinates: {
        x: p.coordinates?.x ?? p.coordinates?.lng ?? p.longitude ?? lng,
        y: p.coordinates?.y ?? p.coordinates?.lat ?? p.latitude ?? lat,
        lat: p.coordinates?.lat ?? p.coordinates?.y ?? p.latitude ?? lat,
        lng: p.coordinates?.lng ?? p.coordinates?.x ?? p.longitude ?? lng,
        label: p.name,
      },
    }));
  } catch (error) {
    console.error("Error in getRecommendations:", error);
    throw error;
  }
}

  async getPlaceById(id: string): Promise<Place | undefined> {
    // In a real app, this might call a specific endpoint like /api/places/:id
    // For now, returning undefined since we'd need to cache or refetch
    return undefined;
  }

  async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number; address: string } | null> {
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/location/geocode?address=${encodeURIComponent(address)}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error("Geocoding failed:", error);
      return null;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/location/reverse?lat=${lat}&lng=${lng}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.address;
    } catch (error) {
      console.error("Reverse geocoding failed:", error);
      return null;
    }
  }
}

export const recommendationService = new RecommendationService();
