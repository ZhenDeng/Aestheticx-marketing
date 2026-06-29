// UTC "YYYY-MM", matching the backend domain.monthKey.
export function monthKey(millis: number): string {
  const d = new Date(millis);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
