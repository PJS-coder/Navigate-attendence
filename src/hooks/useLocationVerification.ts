/**
 * useLocationVerification
 *
 * Fast & efficient office location verification for web:
 *  1. Cached office coordinates & fast 5s geolocation lookups
 *  2. Prevents concurrent / infinite re-verification loops
 *  3. Single-shot background checks every 60s
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type VerificationMethod = 'gps' | null;
export type VerificationStatus = 'checking' | 'gps_ok' | 'out_of_range' | 'error';
export type GpsPermission = 'checking' | 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface LocationVerificationResult {
  status:          VerificationStatus;
  method:          VerificationMethod;
  distanceMeters:  number | null;
  coords:          { lat: number; lng: number } | null;
  label:           string;
  canClockIn:      boolean;
  gpsPermission:   GpsPermission;
  refresh:         () => void;
}

// ── Haversine distance (returns metres) ──────────────────────────────────────
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

export function useLocationVerification(): LocationVerificationResult {
  const [status,         setStatus]         = useState<VerificationStatus>('checking');
  const [method,         setMethod]         = useState<VerificationMethod>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [coords,         setCoords]         = useState<{ lat: number; lng: number } | null>(null);
  const [label,          setLabel]          = useState('Checking location…');
  const [gpsPermission,  setGpsPermission]  = useState<GpsPermission>('checking');

  const isVerifyingRef  = useRef(false);
  const officeCoordsRef = useRef<{ lat: number; lng: number; radiusMeters: number } | null>(null);

  // ── Main Verification Procedure ───────────────────────────────────────────
  const verify = useCallback(async (isManualRefresh = false) => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;

    if (isManualRefresh) {
      setStatus('checking');
      setLabel('Checking location…');
    }

    // 1. Fetch office GPS coordinates (cached after first fetch)
    if (!officeCoordsRef.current) {
      try {
        const res  = await fetch('/api/location/verify');
        const data = await res.json();
        if (data.office) officeCoordsRef.current = data.office;
      } catch {
        officeCoordsRef.current = { lat: 28.6345, lng: 77.285549, radiusMeters: 150 };
      }
    }
    const officeCoords = officeCoordsRef.current || { lat: 28.6345, lng: 77.285549, radiusMeters: 150 };

    // 2. Query GPS
    const gpsSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

    if (gpsSupported) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false, // Faster lock without high-accuracy battery drain
            timeout: 5000,             // 5s max timeout
            maximumAge: 60000,         // Use cached position if < 60s old
          });
        });

        setGpsPermission('granted');

        const userLat  = position.coords.latitude;
        const userLng  = position.coords.longitude;
        const distance = haversineDistance(userLat, userLng, officeCoords.lat, officeCoords.lng);

        setCoords({ lat: userLat, lng: userLng });
        setDistanceMeters(Math.round(distance));

        if (distance <= officeCoords.radiusMeters) {
          setStatus('gps_ok');
          setMethod('gps');
          setLabel(`📍 GPS: At Office (${Math.round(distance)}m away)`);
        } else {
          setStatus('out_of_range');
          setMethod(null);
          setLabel(`🔴 Outside office range (${Math.round(distance)}m away) — Clock-in disabled`);
        }
      } catch (err: unknown) {
        if (err instanceof GeolocationPositionError && err.code === GeolocationPositionError.PERMISSION_DENIED) {
          setGpsPermission('denied');
        }
        setStatus('error');
        setMethod(null);
        setLabel('🔴 Location required to clock in');
      } finally {
        isVerifyingRef.current = false;
      }
    } else {
      setGpsPermission('unsupported');
      setStatus('error');
      setMethod(null);
      isVerifyingRef.current = false;
    }
  }, []);

  // ── Watch browser GPS permission via Permissions API ─────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
      setGpsPermission('unsupported');
      return;
    }

    let mounted = true;

    navigator.permissions.query({ name: 'geolocation' }).then((permStatus) => {
      if (!mounted) return;
      setGpsPermission(permStatus.state as GpsPermission);

      const onChange = () => {
        if (!mounted) return;
        setGpsPermission(permStatus.state as GpsPermission);
        if (permStatus.state === 'granted') {
          verify(true);
        }
      };
      permStatus.addEventListener('change', onChange);
    }).catch(() => {
      if (mounted) setGpsPermission('unsupported');
    });

    return () => { mounted = false; };
  }, [verify]);

  // ── Initial check & periodic 60s interval ─────────────────────────────────
  useEffect(() => {
    verify();
    const interval = setInterval(() => verify(false), 60_000);
    return () => clearInterval(interval);
  }, [verify]);

  const canClockIn = status === 'gps_ok';

  return {
    status,
    method,
    distanceMeters,
    coords,
    label,
    canClockIn,
    gpsPermission,
    refresh: () => verify(true),
  };
}
