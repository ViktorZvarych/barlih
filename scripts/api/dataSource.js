import { CONFIG } from '../config.js';

export async function getSettings() {
  return structuredClone(CONFIG);
}

export async function getBlockedRanges() {
  if (CONFIG.flags.showDemoData) {
    const { generateDemoBlockedRanges } = await import('../data/availability.demo.js');
    return generateDemoBlockedRanges();
  }
  const response = await fetch('/data/availability.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('AVAILABILITY_LOAD_FAILED');
  const data = await response.json();
  // Порожній каркас не означає, що всі дати вільні. Повна валідація — на Кроці 4.
  if (!data.generatedAt || !Array.isArray(data.blockedRanges)) {
    throw new Error('AVAILABILITY_NOT_CONFIGURED');
  }
  return data.blockedRanges;
}

export async function getReviews() {
  if (!CONFIG.flags.showDemoData) return [];
  const { DEMO_REVIEWS } = await import('../data/reviews.demo.js');
  return structuredClone(DEMO_REVIEWS);
}

export async function submitBookingRequest(payload) {
  // Адаптер mailto/endpoint реалізується на Кроці 5; успішна відправка не імітується.
  void payload;
  throw new Error('BOOKING_SUBMISSION_NOT_IMPLEMENTED');
}
