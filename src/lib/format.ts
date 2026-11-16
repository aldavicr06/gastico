export type Currency = 'CRC' | 'USD';

export const CURRENCY_SYMBOL: Record<Currency, string> = { CRC: '₡', USD: '$' };

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

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
    body = groupThousands(Math.round(abs).toString(), ' ');
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

export function monthLabel(month: string, withYear = true) {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[m - 1];
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return withYear ? `${cap} ${y}` : cap;
}

/** "Hoy", "Ayer" or "martes 11 nov". */
export function dayLabel(iso: string, today = new Date()) {
  const t = toISODate(today);
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (iso === t) return 'Hoy';
  if (iso === toISODate(y)) return 'Ayer';
  const [yy, mm, dd] = iso.split('-').map(Number);
  const d = new Date(yy, mm - 1, dd);
  return `${WEEKDAYS[d.getDay()]} ${dd} ${MONTHS[mm - 1].slice(0, 3)}`;
}

export function shortDate(iso: string) {
  const [, mm, dd] = iso.split('-').map(Number);
  return `${dd} ${MONTHS[mm - 1].slice(0, 3)}`;
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
