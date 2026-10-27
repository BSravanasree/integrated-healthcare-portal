// All scheduling is done in Indian Standard Time.
const TZ = 'Asia/Kolkata';

function nowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A slot is bookable if it is today-or-later (IST), within the booking window, and not already past. */
function isSlotInFuture(date, slot) {
  const now = nowParts();
  if (date > now.date) return true;
  return date === now.date && slot > now.time;
}

module.exports = { TZ, nowParts, addDays, isSlotInFuture, BOOKING_WINDOW_DAYS: 30 };
