const MSK_OFFSET_HOURS = 3;
const RESET_HOUR_MSK = 10;
const RESET_HOUR_UTC = RESET_HOUR_MSK - MSK_OFFSET_HOURS; // 07:00 UTC
const WEDNESDAY = 3;

export function nextWednesday10amMsk(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC, 0, 0),
  );
  const todayDow = d.getUTCDay();
  let daysUntilWed = (WEDNESDAY - todayDow + 7) % 7;
  if (daysUntilWed === 0 && now.getTime() >= d.getTime()) {
    daysUntilWed = 7;
  }
  d.setUTCDate(d.getUTCDate() + daysUntilWed);
  return d;
}
