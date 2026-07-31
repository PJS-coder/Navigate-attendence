/**
 * GET /api/location/verify
 *
 * Returns office GPS coordinates so the client can run a
 * Haversine distance check. IP whitelisting has been removed
 * as private IPs (192.168.x.x) are not visible to cloud servers.
 */

const OFFICE_LAT      = parseFloat(process.env.OFFICE_LAT      ?? '28.6345');
const OFFICE_LNG      = parseFloat(process.env.OFFICE_LNG      ?? '77.285549');
const OFFICE_RADIUS_M = parseInt(process.env.OFFICE_RADIUS_METERS ?? '150', 10);

export async function GET() {
  return Response.json({
    office: {
      lat:          OFFICE_LAT,
      lng:          OFFICE_LNG,
      radiusMeters: OFFICE_RADIUS_M,
    },
  });
}
