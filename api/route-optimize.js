import { requireAuth } from './_auth.js';

function waypoint(item) {
  if (Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng))) {
    return { location: { latLng: { latitude: Number(item.lat), longitude: Number(item.lng) } } };
  }
  if (item?.address) return { address: String(item.address) };
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const key = String(process.env.GOOGLE_MAPS_SERVER_KEY || '').trim();
  if (!key) return res.status(501).json({ ok: false, error: 'MAPS_KEY_NOT_CONFIGURED' });

  const origin = waypoint(req.body?.origin);
  const destination = waypoint(req.body?.destination);
  const stops = Array.isArray(req.body?.stops) ? req.body.stops.slice(0, 25) : [];
  const intermediates = stops.map(waypoint);
  if (!origin || !destination || intermediates.some(item => !item)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ROUTE_POINTS' });
  }

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration'
    },
    body: JSON.stringify({
      origin, destination, intermediates, travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE', optimizeWaypointOrder: true,
      languageCode: 'en-AU', units: 'METRIC'
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({ ok: false, error: 'GOOGLE_ROUTES_ERROR', message: result?.error?.message || 'Route optimisation failed.' });
  }
  const route = result.routes?.[0] || {};
  return res.status(200).json({
    ok: true,
    order: route.optimizedIntermediateWaypointIndex || stops.map((_, index) => index),
    distanceMeters: route.distanceMeters || null,
    duration: route.duration || ''
  });
}
