import { Request, Response } from 'express';
import { geocodeAddress, reverseGeocode } from '../services/osm.service';

export const geocode = async (req: Request, res: Response) => {
  try {
    const { address } = req.query;

    if (!address || typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ error: 'Address query parameter is required' });
    }

    const result = await geocodeAddress(address.trim());

    if (result) {
      return res.json({
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        address: result.display_name,
      });
    } else {
      return res.status(400).json({ error: 'Unable to pinpoint selected geolocation. Please enter a valid address manually.' });
    }
  } catch (error: any) {
    console.error('Geocoding error:', error?.message || error);
    if (error.isUpstream || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || (error.status && error.status >= 500)) {
      return res.status(503).json({ error: 'Geolocation service is temporarily unavailable. Please try again later.' });
    }
    return res.status(400).json({ error: 'Unable to pinpoint selected geolocation. Please enter a valid address manually.' });
  }
};

export const reverse = async (req: Request, res: Response) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng || typeof lat !== 'string' || typeof lng !== 'string') {
      return res.status(400).json({ error: 'Latitude and longitude query parameters are required' });
    }

    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);

    if (isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
      return res.status(400).json({ error: 'Invalid coordinates. Latitude must be between -90 and 90, and longitude between -180 and 180.' });
    }

    const address = await reverseGeocode(numLat, numLng);

    if (address) {
      return res.json({ address });
    } else {
      return res.status(400).json({ error: 'Unable to pinpoint selected geolocation. Please enter a valid address manually.' });
    }
  } catch (error: any) {
    console.error('Reverse geocoding error:', error?.message || error);
    if (error.isUpstream || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || (error.status && error.status >= 500)) {
      return res.status(503).json({ error: 'Reverse geolocation service is temporarily unavailable. Please try again later.' });
    }
    return res.status(400).json({ error: 'Unable to pinpoint selected geolocation. Please enter a valid address manually.' });
  }
};
