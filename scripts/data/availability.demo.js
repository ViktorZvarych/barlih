import { CONFIG } from '../config.js';

const DAY_MS = 86_400_000;

export function generateDemoBlockedRanges(today = new Date()) {
  // DEMO: відносні дати, без реальних бронювань чи персональних даних.
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.property.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(today);
  const part = (type) => date.find((entry) => entry.type === type).value;
  const start = Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day')));
  const dayAt = (offset) => new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
  return [[5, 8], [20, 22], [45, 52], [70, 74]].map(([from, to], index) => ({
    id: `demo-${index + 1}`, from: dayAt(from), to: dayAt(to), type: 'booked',
  }));
}
