import type { Lang } from './i18n';

export type Currency = 'CRC' | 'USD';

export const CURRENCY_SYMBOL: Record<Currency, string> = { CRC: '₡', USD: '$' };

const MONTHS: Record<Lang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const WEEKDAYS: Record<Lang, string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** Group digits with a thin space-like separator, Costa Rica style (₡12 345). */
function groupThousands(intPart: string, sep: string) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Format cents as money. CRC is shown without decimals (₡12 345) and USD with
 * two ($1,234.50). Implemented by hand so it renders the same on every device.
 */
export function formatMoney(cents: number, currency: Currency = 'CRC', opts: { sign?: boolean } = {}) {
  const negative = cents < 0;
  const abs = Math.abs(cents) / 100;
  let body: string;
  if (currency === 'CRC') {
    // Costa Rica: space for thousands, comma for decimals, decimals only when there are céntimos.
    const [i, d] = abs.toFixed(2).split('.');
    body = groupThousands(i, ' ') + (d === '00' ? '' : `,${d}`);
  } else {
    const [i, d] = abs.toFixed(2).split('.');
    body = `${groupThousands(i, ',')}.${d}`;
  }
  const sign = negative ? '−' : opts.sign ? '+' : '';
  return `${sign}${CURRENCY_SYMBOL[currency]}${body}`;
}

/** Compact form for chart labels: ₡245k, ₡1.2M */
export function formatCompact(cents: number, currency: Currency = 'CRC') {
  const v = cents / 100;
  const s = CURRENCY_SYMBOL[currency];
  if (v >= 1_000_000) return `${s}${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${s}${Math.round(v / 1_000)}k`;
  return `${s}${Math.round(v)}`;
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentMonth(d = new Date()) {
  return toISODate(d).slice(0, 7);
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  return currentMonth(new Date(y, m - 1 + delta, 1));
}

export function monthLabel(month: string, withYear = true, lang: Lang = 'es') {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[lang][m - 1];
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return withYear ? `${cap} ${y}` : cap;
}

/** "Hoy" / "Today", "Ayer" / "Yesterday", or "martes 11 nov" / "Tuesday, Nov 11". */
export function dayLabel(iso: string, lang: Lang = 'es', today = new Date()) {
  const t = toISODate(today);
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (iso === t) return lang === 'en' ? 'Today' : 'Hoy';
  if (iso === toISODate(y)) return lang === 'en' ? 'Yesterday' : 'Ayer';
  const [yy, mm, dd] = iso.split('-').map(Number);
  const weekday = WEEKDAYS[lang][new Date(yy, mm - 1, dd).getDay()];
  return lang === 'en' ? `${weekday}, ${shortDate(iso, lang)}` : `${weekday} ${shortDate(iso, lang)}`;
}

/** "11 nov" / "Nov 11". */
export function shortDate(iso: string, lang: Lang = 'es') {
  const [, mm, dd] = iso.split('-').map(Number);
  const month = MONTHS[lang][mm - 1].slice(0, 3);
  return lang === 'en' ? `${month} ${dd}` : `${dd} ${month}`;
}

/** "83 %" (es) or "83%" (en), capped so absurd ratios never break a layout: "999+ %". */
export function formatPercent(ratio: number, lang: Lang = 'es') {
  const n = Math.round(ratio * 100);
  const sep = lang === 'en' ? '' : ' ';
  return n > 999 ? `999+${sep}%` : `${n}${sep}%`;
}

/**
 * Keeps only what a money field may hold while typing: digits and one decimal
 * separator (comma or point) with at most 2 decimals and 10 integer digits.
 * "abc-5e3" → "53", "12,5" → "12.5".
 */
export function sanitizeAmountInput(text: string) {
  const cleaned = text.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [int, ...rest] = cleaned.split('.');
  const intPart = int.slice(0, 10);
  if (rest.length === 0) return intPart;
  return `${intPart || '0'}.${rest.join('').slice(0, 2)}`;
}

/** Shift an ISO date by whole days. */
export function addDays(iso: string, delta: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + delta));
}

export function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Local "HH:MM" from SQLite's UTC `datetime('now')` text, or null if unparseable. */
export function localTime(sqliteUtc: string): { date: string; time: string } | null {
  const d = new Date(sqliteUtc.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date: toISODate(d), time };
}

/** Cents back to keypad text: "12500" or "12500.5". */
export function centsToInput(cents: number) {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2).replace(/0$/, '');
}

/** Parse what the user typed ("12.500", "12,500.50") to cents. */
export function inputToCents(text: string): number {
  const cleaned = text.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',') && !cleaned.includes('.') && /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(',', '.')
    : cleaned.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
