function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** The map card line under a route map, e.g. "Pickup at Delhi · 3h 37m by road · 284.9 km". */
export function routeSummary(t: { originLabel: string; durationMin: number | null; distanceKm: number | null }): string {
  const parts = [`Pickup at ${t.originLabel}`];
  if (t.durationMin !== null) parts.push(`${duration(t.durationMin)} by road`);
  if (t.distanceKm !== null) parts.push(t.durationMin !== null ? `${t.distanceKm} km` : `≈ ${t.distanceKm} km`);
  return parts.join(' · ');
}
