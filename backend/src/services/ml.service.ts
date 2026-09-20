import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
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
 * Resolve the Python executable path safely across environments.
 * Priority: PYTHON_PATH env var > .venv inside mlDir > system 'python3' / 'python'
 */
export const resolvePythonPath = (mlDir: string): string => {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }

  const venvPython = process.platform === 'win32'
    ? path.join(mlDir, '.venv', 'Scripts', 'python.exe')
    : path.join(mlDir, '.venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  // Use the system python3 / python from PATH — no hardcoded user-specific paths
  return process.platform === 'win32' ? 'python' : 'python3';
};

/**
 * Execute batch prediction via HTTP ML service (production/Vercel or local ML server)
 * with graceful fallback to local Python subprocess runner for local dev.
 */
export const predictSuitabilityBatch = async (
  featuresList: MLPlaceFeatures[],
  timeoutMs: number = 10000
): Promise<MLPredictionResult[] | null> => {
  if (!featuresList || featuresList.length === 0) {
    return [];
  }

  // 1. Try HTTP ML Service if ML_SERVICE_URL is defined or in production
  const mlServiceUrl = process.env.ML_SERVICE_URL;
  if (mlServiceUrl) {
    try {
      const endpoint = mlServiceUrl.endsWith('/predict') ? mlServiceUrl : `${mlServiceUrl.replace(/\/$/, '')}/predict`;
      const response = await axios.post(
        endpoint,
        featuresList,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: timeoutMs,
        }
      );

      if (response.data && Array.isArray(response.data.predictions)) {
        return response.data.predictions;
      }
    } catch (httpError: any) {
      console.warn(`HTTP ML Service at ${mlServiceUrl} failed:`, httpError.message);
      // If in production or no local subprocess available, fail gracefully
      if (process.env.NODE_ENV === 'production') {
        return null;
      }
    }
  }

  // In production (e.g. Vercel serverless), local python subprocess is not available; use deterministic ranking fallback
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  // 2. Local development fallback: execute via Python subprocess.
  // Use process.cwd() (the project root) rather than __dirname because __dirname
  // resolves inside .next/ when this module is bundled by Turbopack/Next.js.
  return new Promise((resolve) => {
    try {
      const mlDir = path.resolve(process.cwd(), 'ml');
      const scriptPath = path.join(mlDir, 'src', 'batch_predict.py');

      if (!fs.existsSync(scriptPath)) {
        console.warn(`ML script not found at expected path: ${scriptPath} — skipping subprocess, using fallback.`);
        resolve(null);
        return;
      }

      const pythonExec = resolvePythonPath(mlDir);
      console.log(`[ML] Spawning Python: ${pythonExec} | Script: ${scriptPath}`);

      const pyProcess = spawn(/*turbopackIgnore: true*/ pythonExec, [scriptPath], {
        cwd: mlDir,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      let stdoutData = '';
      let stderrData = '';
      let isTimedOut = false;

      const timer = setTimeout(() => {
        isTimedOut = true;
        pyProcess.kill();
        console.warn('ML prediction timed out -> fallback will be used');
        resolve(null);
      }, timeoutMs);

      pyProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pyProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      pyProcess.on('error', (err) => {
        clearTimeout(timer);
        console.warn('Failed to start ML Python process:', err.message);
        resolve(null);
      });

      pyProcess.on('close', (code) => {
        clearTimeout(timer);
        if (isTimedOut) return;

        if (code !== 0) {
          console.warn(`ML process exited with code ${code}: ${stderrData}`);
          resolve(null);
          return;
        }

        try {
          const parsed = JSON.parse(stdoutData);
          if (parsed && Array.isArray(parsed.predictions)) {
            resolve(parsed.predictions);
          } else {
            console.warn('ML response missing predictions array:', parsed);
            resolve(null);
          }
        } catch (parseError: any) {
          console.warn('Failed to parse ML response JSON:', parseError.message);
          resolve(null);
        }
      });

      // Send features JSON through stdin
      pyProcess.stdin.write(JSON.stringify(featuresList));
      pyProcess.stdin.end();
    } catch (error: any) {
      console.warn('ML service execution error:', error.message || error);
      resolve(null);
    }
  });
};

