/** Distancia Haversine en km entre dos coordenadas. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** ETA aproximada en minutos asumiendo velocidad urbana promedio (~25 km/h). */
export function etaMinutes(km: number, avgSpeedKmh = 25): number {
  return Math.max(1, Math.round((km / avgSpeedKmh) * 60));
}
