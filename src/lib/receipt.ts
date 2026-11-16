/**
 * Receipt / card-voucher parser.
 *
 * Takes the raw OCR lines of a receipt ("factura", "tiquete electrónico" or
 * card voucher) and extracts the total, the date, the merchant name and a
 * suggested category. Pure TypeScript, no React Native imports, so it can be
 * unit-tested in Node.
 */

export type ParsedReceipt = {
  /** Total in major units (e.g. 12500.5 = ₡12 500,50). null if not found. */
  total: number | null;
  /** How we found the total: a "TOTAL"-like label, or the largest amount. */
  totalSource: 'label' | 'largest' | null;
  /** ISO date (YYYY-MM-DD) if one was found. */
  date: string | null;
  merchant: string | null;
  /** Category id suggestion (see CATEGORY_KEYWORDS). */
  suggestedCategory: string | null;
  /** All amounts found, biggest first — handy for a "pick another" UI. */
  candidates: number[];
};

// Ordered by priority: the first matching label wins.
const TOTAL_LABELS: { re: RegExp; score: number }[] = [
  { re: /TOTAL\s*A\s*PAGAR/, score: 100 },
  { re: /TOTAL\s*COMPROBANTE/, score: 98 },
  { re: /TOTAL\s*(GENERAL|FACTURA|VENTA|NETO)/, score: 95 },
  { re: /MONTO\s*TOTAL/, score: 95 },
  { re: /GRAN\s*TOTAL/, score: 95 },
  { re: /\bTOTAL\b/, score: 80 },
  { re: /\bIMPORTE\b/, score: 60 },
  { re: /\bMONTO\b/, score: 55 },
  { re: /\bAMOUNT\b/, score: 55 },
];

// Lines that contain "TOTAL" but are NOT the amount paid.
const NOT_TOTAL = /SUB\s*-?\s*TOTAL|TOTAL\s*(DE\s*)?(IVA|IMP|IMPUESTO|DESC|DESCUENTO|GRAVADO|EXENTO|EXONERADO|ARTICULOS|ITEMS|LINEAS|SERVICIOS\s*GRAVADOS|MERCANCIAS)|CANT(IDAD)?|VUELTO|CAMBIO|EFECTIVO|PAGO\s*CON/;

// Lines whose numbers are identifiers, not money.
const ID_LINE = /\b(TEL|TELEFONO|FAX|CED|CEDULA|JURIDICA|AUT|AUTORIZACION|REF|REFERENCIA|TERMINAL|TERM|LOTE|TARJ|TARJETA|AFILIADO|CLAVE|CONSECUTIVO|NO\.?\s*FACT|FACTURA\s*N|ORDEN|CAJA|CAJERO|RECIBO|TRANS|SERIE|CODIGO|COD)\b/;

const AMOUNT_RE =
  /(?:₡|¢|\$|CRC|USD|C\$)?\s*(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}|\d{1,7})(?![\d/])/g;

/** Strip accents, upper-case and collapse whitespace. */
export function normalize(line: string): string {
  return line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a money string written in either "12,345.67" (US) or "12.345,67"
 * (Latin American) style. Returns null for things that are not amounts.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[₡¢$]|CRC|USD|C\$/g, '').trim();
  if (!s) return null;

  // "12 345,00" -> spaces are thousands separators.
  s = s.replace(/(\d)\s(?=\d{3}\b)/g, '$1');
  if (/\s/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal separator.
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length === 2 && tail.length <= 2) {
      s = parts.join('.'); // decimal
    } else if (parts.slice(1).every((p) => p.length === 3)) {
      s = parts.join(''); // thousands
    } else {
      return null;
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const value = parseAmount(m[1]);
    if (value !== null) out.push(value);
  }
  return out;
}

/** An amount "looks like money" if it has separators/decimals or a currency sign. */
function looksLikeMoney(line: string): boolean {
  return /[₡¢$]|CRC|USD|\d[.,]\d{2}\b|\d{1,3}[.,]\d{3}/.test(line);
}

function findTotal(lines: string[]): { total: number | null; source: ParsedReceipt['totalSource'] } {
  let best: { score: number; value: number; index: number } | null = null;

  lines.forEach((line, i) => {
    if (NOT_TOTAL.test(line)) return;
    const label = TOTAL_LABELS.find((l) => l.re.test(line));
    if (!label) return;

    // Amount on the same line, or (OCR often splits columns) on the next 2 lines.
    let values = amountsIn(line.replace(label.re, ' '));
    for (let k = 1; values.length === 0 && k <= 2 && i + k < lines.length; k++) {
      const next = lines[i + k];
      if (TOTAL_LABELS.some((l) => l.re.test(next)) || ID_LINE.test(next)) break;
      values = amountsIn(next);
    }
    if (values.length === 0) return;

    const value = Math.max(...values);
    // Prefer the higher-priority label; on ties prefer the one further down
    // (the final total is usually the last one printed).
    if (!best || label.score > best.score || (label.score === best.score && i > best.index)) {
      best = { score: label.score, value, index: i };
    }
  });

  if (best) return { total: (best as { value: number }).value, source: 'label' };

  const money = allMoneyCandidates(lines);
  return money.length ? { total: money[0], source: 'largest' } : { total: null, source: null };
}

function allMoneyCandidates(lines: string[]): number[] {
  const set = new Set<number>();
  for (const line of lines) {
    if (ID_LINE.test(line) || !looksLikeMoney(line)) continue;
    if (/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line) && amountsIn(line).length <= 1) continue; // dates
    amountsIn(line).forEach((v) => set.add(v));
  }
  return [...set].sort((a, b) => b - a);
}

export function findDate(lines: string[], today = new Date()): string | null {
  for (const line of lines) {
    // Costa Rica uses DD/MM/YYYY.
    const m = line.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= today.getFullYear() + 1) {
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    // ISO style 2026-11-15
    const iso = line.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

const NOT_MERCHANT =
  /FACTURA|TIQUETE|ELECTRONIC|COMPROBANTE|CEDULA|JURIDICA|TEL|FECHA|HORA|CLIENTE|RECEPTOR|EMISOR|DIRECCION|CORREO|EMAIL|WWW|HTTP|GRACIAS|BIENVENID|VOUCHER|VENTA|COMERCIO|^\W*$/;

const BANKS = /\b(BAC|CREDOMATIC|BANCO|BCR|BNCR|DAVIVIENDA|SCOTIABANK|PROMERICA|LAFISE|VISA|MASTERCARD)\b/;

export function findMerchant(lines: string[]): string | null {
  // Card vouchers print the merchant after "COMERCIO:".
  for (const line of lines) {
    const m = line.match(/^(?:COMERCIO|NOMBRE COMERCIAL|ESTABLECIMIENTO)\s*:?\s*(.{3,})$/);
    if (m) return titleCase(m[1].replace(/[^A-Z0-9 &.'-]/g, '').trim());
  }
  for (const line of lines.slice(0, 8)) {
    if (BANKS.test(line)) continue;
    const letters = line.replace(/[^A-Z]/g, '');
    if (letters.length >= 3 && !NOT_MERCHANT.test(line) && !/\d{4,}/.test(line)) {
      return titleCase(line.replace(/[^A-Z0-9 &.'-]/g, '').trim());
    }
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bS\.?a\.?\b/g, 'S.A.');
}

/** Keyword → category id. Keys must match the ids seeded in db.ts. */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  super: ['AUTO MERCADO', 'AUTOMERCADO', 'MAS X MENOS', 'MASXMENOS', 'WALMART', 'PALI', 'MAXI PALI', 'PRICESMART', 'FRESH MARKET', 'SUPERMERCADO', 'MEGASUPER', 'PERIMERCADOS', 'AUTOMERCADO', 'MINISUPER', 'SUPER '],
  comida: ['RESTAURANTE', 'SODA ', 'PIZZA', 'KFC', 'MCDONALD', 'BURGER', 'STARBUCKS', 'CAFE', 'SUBWAY', 'TACO BELL', 'POPS', 'SPOON', 'PANADERIA', 'POLLO', 'SUSHI', 'RAPPI', 'UBER EATS', 'BAR '],
  transporte: ['GASOLINERA', 'SERVICENTRO', 'COMBUSTIBLE', 'GASOLINA', 'DIESEL', 'SUPER REGULAR', 'UBER', 'DIDI', 'PEAJE', 'PARQUEO', 'TAXI', 'BUS ', 'RITEVE', 'MARCHAMO'],
  salud: ['FARMACIA', 'FISCHEL', 'LA BOMBA', 'SUCRE', 'CLINICA', 'HOSPITAL', 'LABORATORIO', 'DENTAL', 'OPTICA', 'MEDICO'],
  servicios: ['KOLBI', ' ICE', 'CNFL', 'AYA', 'ESPH', 'LIBERTY', 'TIGO', 'CLARO', 'INTERNET', 'ELECTRICIDAD', 'AGUA POTABLE'],
  entretenimiento: ['CINE', 'CINEPOLIS', 'CCM', 'NETFLIX', 'SPOTIFY', 'STEAM', 'PLAYSTATION', 'TEATRO', 'CONCIERTO', 'BOLICHE'],
  casa: ['EPA', 'CONSTRUPLAZA', 'FERRETERIA', 'PEQUENO MUNDO', 'IKEA', 'CASA ', 'MUEBLES', 'EL LAGAR'],
  compras: ['TIENDA', 'BOUTIQUE', 'ZARA', 'SIMAN', 'UNIVERSAL', 'MULTIPLAZA', 'AMAZON', 'GOLLO', 'MONGE', 'IMPORTADORA MONGE'],
};

export function suggestCategory(text: string): string | null {
  const t = ` ${text} `;
  let best: { id: string; hits: number } | null = null;
  for (const [id, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { id, hits };
  }
  return best?.id ?? null;
}

export function parseReceipt(rawLines: string[], today = new Date()): ParsedReceipt {
  const lines = rawLines
    .flatMap((l) => l.split(/\r?\n/))
    .map(normalize)
    .filter(Boolean);

  const { total, source } = findTotal(lines);
  return {
    total,
    totalSource: source,
    date: findDate(lines, today),
    merchant: findMerchant(lines),
    suggestedCategory: suggestCategory(lines.join(' ')),
    candidates: allMoneyCandidates(lines).slice(0, 6),
  };
}
