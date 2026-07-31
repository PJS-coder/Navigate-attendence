/**
 * useLocationVerification
 *
 * Single-layer office location verification for web:
 *
 *  1. GPS (primary) — navigator.geolocation → Haversine distance check
 *  2. Pending       — GPS unavailable/denied/outside range → clock-in
 *                     still allowed but flagged for manager approval
 *
 * Also tracks GPS permission state via the Permissions API so the
 * dashboard can show a persistent warning when location is blocked.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type VerificationMethod = 'gps' | 'pending' | null;
export type VerificationStatus = 'checking' | 'gps_ok' | 'pending' | 'error';

/** 'denied' = user explicitly blocked location in browser settings */
export type GpsPermission = 'checking' | 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface LocationVerificationResult {
  status:          VerificationStatus;
  method:          VerificationMethod;
  /** Distance in metres from office (only when GPS succeeded) */
  distanceMeters:  number | null;
  /** GPS coords captured (only when GPS succeeded) */
  coords:          { lat: number; lng: number } | null;
  /** Human-readable status line for the UI badge */
  label:           string;
  /** Is clock-in permitted? true for both gps_ok and pending */
  canClockIn:      boolean;
  /** GPS permission state — 'denied' triggers the persistent warning banner */
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

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useLocationVerification(): LocationVerificationResult {
  const [status,         setStatus]         = useState<VerificationStatus>('checking');
  const [method,         setMethod]         = useState<VerificationMethod>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [coords,         setCoords]         = useState<{ lat: number; lng: number } | null>(null);
  const [label,          setLabel]          = useState('Checking location…');
  const [gpsPermission,  setGpsPermission]  = useState<GpsPermission>('checking');

  const permStatusRef = useRef<PermissionStatus | null>(null);

  // ── Watch browser GPS permission via Permissions API ─────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
      setGpsPermission('unsupported');
      return;
    }

    let mounted = true;

    navigator.permissions.query({ name: 'geolocation' }).then((permStatus) => {
      if (!mounted) return;
      permStatusRef.current = permStatus;
      setGpsPermission(permStatus.state as GpsPermission);

      const onChange = () => {
        if (mounted) setGpsPermission(permStatus.state as GpsPermission);
      };
      permStatus.addEventListener('change', onChange);
    }).catch(() => {
      if (mounted) setGpsPermission('unsupported');
    });

    return () => { mounted = false; };
  }, []);

  const verify = useCallback(async () => {
    setStatus('checking');
    setLabel('Checking location…');

    // ── STEP 1: Fetch office GPS coordinates from server ─────────────────────
    // Fallback only used if /api/location/verify is unreachable.
    // Actual values are always served from server env vars (OFFICE_LAT, OFFICE_LNG, OFFICE_RADIUS_METERS).
    let officeCoords = { lat: 28.6345, lng: 77.285549, radiusMeters: 150 };

    try {
      const res  = await fetch('/api/location/verify');
      const data = await res.json();
      if (data.office) officeCoords = data.office;
    } catch {
      // Use hardcoded defaults if server unreachable
    }

    // ── STEP 2: Try GPS ──────────────────────────────────────────────────────
    const gpsSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

    if (gpsSupported) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 30000,
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
          return;
        }

        // GPS works but user is outside the office radius
        setStatus('pending');
        setMethod('pending');
        setLabel(`🟡 Outside office range (${Math.round(distance)}m away) — Needs Approval`);
        return;

      } catch (err: unknown) {
        if (err instanceof GeolocationPositionError && err.code === GeolocationPositionError.PERMISSION_DENIED) {
          setGpsPermission('denied');
        }
      }
    } else {
      setGpsPermission('unsupported');
    }

    // ── STEP 3: GPS unavailable / denied — pending approval ──────────────────
    setStatus('pending');
    setMethod('pending');
    setLabel('🟡 Location unavailable — Needs Manager Approval');
  }, []);

  useEffect(() => {
    verify();
    const interval = setInterval(verify, 60_000);
    return () => clearInterval(interval);
  }, [verify]);

  // Auto re-verify when permission is re-granted from browser settings
  useEffect(() => {
    if (gpsPermission === 'granted' && (status === 'pending' || status === 'checking')) {
      verify();
    }
  }, [gpsPermission, status, verify]);

  const canClockIn = status === 'gps_ok' || status === 'pending';

  return {
    status,
    method,
    distanceMeters,
    coords,
    label,
    canClockIn,
    gpsPermission,
    refresh: verify,
  };
}
