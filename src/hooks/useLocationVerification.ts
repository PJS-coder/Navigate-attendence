/**
 * useLocationVerification.ts
 *
 * Fast, robust & real-time high-accuracy office GPS verification:
 *  1. Immediate dual-speed GPS lock (High Accuracy + instant fallback)
 *  2. Continuous real-time location watch (watchPosition) for zero-lag updates
 *  3. Indoor accuracy buffer to eliminate false "out of range" errors in buildings
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type VerificationMethod = 'gps' | null;
export type VerificationStatus = 'checking' | 'gps_ok' | 'out_of_range' | 'error';
export type GpsPermission = 'checking' | 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface LocationVerificationResult {
  status:          VerificationStatus;
  method:          VerificationMethod;
  distanceMeters:  number | null;
  coords:          { lat: number; lng: number; accuracy?: number } | null;
  label:           string;
  canClockIn:      boolean;
  gpsPermission:   GpsPermission;
  refresh:         () => void;
}

// ── Haversine distance in meters ──────────────────────────────────────────────
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R  = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEFAULT_OFFICE = {
  lat: 28.7092935,
  lng: 77.1234043,
  radiusMeters: 200,
};

export function useLocationVerification(): LocationVerificationResult {
  const [status,         setStatus]         = useState<VerificationStatus>('checking');
  const [method,         setMethod]         = useState<VerificationMethod>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [coords,         setCoords]         = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [label,          setLabel]          = useState('Detecting office location…');
  const [gpsPermission,  setGpsPermission]  = useState<GpsPermission>('checking');

  const officeCoordsRef = useRef<{ lat: number; lng: number; radiusMeters: number }>(DEFAULT_OFFICE);
  const watchIdRef      = useRef<number | null>(null);
  const isFetchingRef   = useRef<boolean>(false);

  // 1. Fetch server office coordinates once
  useEffect(() => {
    let mounted = true;
    fetch('/api/location/verify')
      .then(res => res.json())
      .then(data => {
        if (mounted && data.office) {
          officeCoordsRef.current = {
            lat: Number(data.office.lat) || DEFAULT_OFFICE.lat,
            lng: Number(data.office.lng) || DEFAULT_OFFICE.lng,
            radiusMeters: Math.max(Number(data.office.radiusMeters) || 150, 150),
          };
        }
      })
      .catch(() => {
        // Keep default
      });
    return () => { mounted = false; };
  }, []);

  // 2. Process incoming GPS position
  const processPosition = useCallback((pos: GeolocationPosition) => {
    setGpsPermission('granted');
    const userLat = pos.coords.latitude;
    const userLng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;

    const office = officeCoordsRef.current;
    const rawDistance = haversineDistance(userLat, userLng, office.lat, office.lng);
    const roundedDist = Math.round(rawDistance);

    // Apply smart accuracy margin for indoor / concrete building signal loss
    const margin = accuracy > 0 && accuracy < 100 ? accuracy * 0.35 : 0;
    const effectiveDistance = Math.max(0, rawDistance - margin);

    setCoords({ lat: userLat, lng: userLng, accuracy: Math.round(accuracy) });
    setDistanceMeters(roundedDist);

    if (effectiveDistance <= office.radiusMeters || rawDistance <= office.radiusMeters) {
      setStatus('gps_ok');
      setMethod('gps');
      setLabel(`🟢 At Office (${roundedDist}m away · GPS Verified)`);
    } else {
      setStatus('out_of_range');
      setMethod(null);
      setLabel(`🔴 Outside office range (${roundedDist}m away) — Clock-in disabled`);
    }
  }, []);

  // 3. Fast Geolocation Request (High Accuracy with instant fallback)
  const acquirePosition = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsPermission('unsupported');
      setStatus('error');
      setLabel('⚠️ Geolocation not supported on this browser');
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    // Fast attempt: High Accuracy
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        isFetchingRef.current = false;
        processPosition(pos);
      },
      (err) => {
        // On timeout or high-accuracy failure, retry immediately with standard accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            isFetchingRef.current = false;
            processPosition(pos);
          },
          (fallbackErr) => {
            isFetchingRef.current = false;
            if (fallbackErr.code === fallbackErr.PERMISSION_DENIED) {
              setGpsPermission('denied');
              setStatus('error');
              setLabel('🔒 Location permission denied. Please allow location access.');
            } else {
              setStatus('error');
              setLabel('⚠️ Could not get accurate location. Tap refresh to retry.');
            }
          },
          {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 30000,
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 10000,
      }
    );
  }, [processPosition]);

  // 4. Start active watchPosition for real-time live GPS streaming
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;

    acquirePosition();

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          processPosition(pos);
        },
        () => {
          // Silent catch in watcher to avoid interrupting existing position
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        }
      );
    } catch {
      // Ignore
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [acquirePosition, processPosition]);

  // 5. Watch permissions change
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return;

    let mounted = true;
    navigator.permissions.query({ name: 'geolocation' }).then((permStatus) => {
      if (!mounted) return;
      setGpsPermission(permStatus.state as GpsPermission);

      const handleChange = () => {
        if (!mounted) return;
        setGpsPermission(permStatus.state as GpsPermission);
        if (permStatus.state === 'granted') {
          acquirePosition();
        }
      };

      permStatus.addEventListener('change', handleChange);
    }).catch(() => {});

    return () => { mounted = false; };
  }, [acquirePosition]);

  const canClockIn = status === 'gps_ok';

  return {
    status,
    method,
    distanceMeters,
    coords,
    label,
    canClockIn,
    gpsPermission,
    refresh: () => {
      setStatus('checking');
      setLabel('Refetching GPS coordinates…');
      acquirePosition();
    },
  };
}
