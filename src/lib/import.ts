/**
 * Turns spreadsheet rows (from Excel or CSV) into budgets and transactions.
 *
 * Pure TypeScript with no React Native imports, so it runs in the app and in
 * `npm run test:import`. It understands:
 * - Spanish and English column names, in any order, with the header in any of
 *   the first rows ("Fecha", "Date", "Monto (₡)", "Categoría"...);
 * - category names with or without accents, in either language, plus common
 *   synonyms ("Supermercado" → Súper, "Luz" → Servicios, "Gas" → Transporte);
 * - amounts like 180 000 · 180,000 · ₡180.000,50 · $1,234.56 · (500) · -500;
 * - dates as Excel date cells, 2026-11-19, 19/11/2026 or 11/19/2026.
 */
import type { TxType } from './db';
import type { Lang } from './i18n';

export type Cell = string | number | boolean | Date | null | undefined;
export type Sheet = { name: string; rows: Cell[][] };
/** A category the file can be matched to, with its names in every language. */
export type CategoryRef = { id: string; type: TxType; names: string[] };

export type BudgetRow = {
  key: string;
  sheet: string;
  /** 1-based row number as the user sees it in Excel. */
  row: number;
  label: string;
  categoryId: string;
  /** False when the category text was not recognized (sent to "Otros"). */
  matched: boolean;
  cents: number;
};

export type TxRow = {
  key: string;
  sheet: string;
  row: number;
  date: string;
  type: TxType;
  label: string;
  categoryId: string;
  matched: boolean;
  merchant: string | null;
  note: string | null;
  cents: number;
  /** Already saved in the app (same date, type, amount and merchant): not imported again. */
  duplicate: boolean;
};

export type SkipReason = 'amount' | 'date';
export type SkippedRow = { sheet: string; row: number; reason: SkipReason };

export type ImportPlan = { budgets: BudgetRow[]; transactions: TxRow[]; skipped: SkippedRow[] };

/** Category for anything not recognized. */
export const FALLBACK_CATEGORY: Record<TxType, string> = { expense: 'otros', income: 'extra' };

// ---------- Text helpers ----------

/** "Categoría  (₡)" → "categoria". Lowercase, no accents, words only. */
export function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Excel shows cells our CSV export protected with a leading apostrophe; drop it. */
function cellText(value: Cell) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

const isBlank = (value: Cell) => cellText(value) === '';

// ---------- Columns ----------

type Field = 'date' | 'type' | 'category' | 'merchant' | 'note' | 'amount' | 'budget';

const FIELD_ALIASES: Record<Field, string[]> = {
  date: ['fecha', 'date', 'dia', 'day'],
  type: ['tipo', 'type', 'clase', 'kind'],
  category: ['categoria', 'category', 'rubro', 'categorias', 'categories'],
  merchant: ['comercio', 'merchant', 'tienda', 'store', 'lugar', 'payee', 'proveedor', 'establecimiento', 'vendor'],
  note: ['nota', 'notas', 'note', 'notes', 'descripcion', 'description', 'detalle', 'concepto', 'memo'],
  amount: ['monto', 'amount', 'valor', 'importe', 'total', 'cantidad', 'value'],
  budget: [
    'presupuesto', 'budget', 'presupuesto mensual', 'monthly budget', 'monto mensual', 'limite', 'limite mensual',
    'mensual', 'monthly',
  ],
};

function fieldOf(header: Cell): Field | null {
  const n = normalize(header);
  if (!n) return null;
  // Longest alias first, so "monto mensual" is a budget and not an amount.
  let best: { field: Field; len: number } | null = null;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [Field, string[]][]) {
    for (const a of aliases) {
      if ((n === a || n.startsWith(a + ' ')) && (!best || a.length > best.len)) best = { field, len: a.length };
    }
  }
  return best?.field ?? null;
}

type Columns = Partial<Record<Field, number>>;

/** Finds the header among the first rows: the one naming the most known columns. */
function findHeader(rows: Cell[][]): { index: number; columns: Columns } | null {
  let best: { index: number; columns: Columns; count: number } | null = null;
  for (let index = 0; index < Math.min(rows.length, 10); index++) {
    const columns: Columns = {};
    rows[index].forEach((cell, col) => {
      const field = fieldOf(cell);
      if (field && columns[field] === undefined) columns[field] = col;
    });
    const count = Object.keys(columns).length;
    if (count >= 2 && (!best || count > best.count)) best = { index, columns, count };
  }
  return best ? { index: best.index, columns: best.columns } : null;
}

// ---------- Amounts ----------

/**
 * Parses a money cell to signed cents, or null.
 * With both separators the last one is the decimal mark (1,234.56 · 1.234,56);
 * a single one followed by exactly three digits groups thousands (180.000).
 */
export function parseMoney(value: Cell): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0 ? Math.round(value * 100) : null;
  let s = cellText(value);
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[\s  ]/g, '').replace(/₡|\$|crc|usd|colones?|dolares?|dólares?/gi, '');
  if (/^[-−–]/.test(s)) { negative = true; s = s.slice(1); }
  if (/[-−]$/.test(s)) { negative = true; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = s.split(thousands).join('').replace(decimal, '.');
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    if (!sep) normalized = s;
    else {
      const parts = s.split(sep);
      const groupsOfThree = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
      normalized = parts.length > 2 || groupsOfThree ? parts.join('') : parts.join('.');
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n === 0) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

// ---------- Dates ----------

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject impossible dates such as 31/02.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/**
 * Parses a date cell to YYYY-MM-DD, or null. Excel stores dates as days since
 * 1899-12-30. For 05/06/2026 the language decides: day first in Spanish, month
 * first in English (unless one of the numbers can only be a day).
 */
export function parseDate(value: Cell, lang: Lang = 'es'): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return null; // roughly 1954 – 2119
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = cellText(value);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const dayFirst = a > 12 ? true : b > 12 ? false : lang === 'es';
    return dayFirst ? iso(year, b, a) : iso(year, a, b);
  }
  return null;
}

// ---------- Types and categories ----------

const TYPE_WORDS: Record<TxType, string[]> = {
  expense: ['gasto', 'gastos', 'expense', 'expenses', 'egreso', 'egresos', 'salida', 'debito', 'debit', 'cargo', 'retiro'],
  income: ['ingreso', 'ingresos', 'income', 'entrada', 'credito', 'credit', 'abono', 'deposito', 'deposit'],
};

function parseType(value: Cell): TxType | null {
  const n = normalize(value);
  if (!n) return null;
  for (const type of ['expense', 'income'] as TxType[]) if (TYPE_WORDS[type].includes(n)) return type;
  return null;
}

/** Everyday words people use for each built-in category, in Spanish and English. */
const SYNONYMS: Record<string, string[]> = {
  super: ['supermercado', 'super', 'mercado', 'abarrotes', 'pulperia', 'comestibles', 'groceries', 'grocery', 'supermarket'],
  comida: [
    'comida', 'comidas', 'restaurante', 'restaurantes', 'almuerzo', 'cena', 'desayuno', 'cafe', 'cafeteria', 'soda',
    'comida rapida', 'food', 'restaurant', 'restaurants', 'dining', 'eating out', 'fast food', 'coffee', 'lunch', 'dinner',
  ],
  transporte: [
    'transporte', 'gasolina', 'combustible', 'uber', 'taxi', 'bus', 'buses', 'parqueo', 'peaje', 'marchamo', 'carro',
    'transport', 'transportation', 'gas', 'fuel', 'parking', 'toll', 'car',
  ],
  casa: ['casa', 'hogar', 'alquiler', 'renta', 'hipoteca', 'muebles', 'mantenimiento', 'home', 'house', 'housing', 'rent', 'mortgage'],
  servicios: [
    'servicios', 'luz', 'agua', 'electricidad', 'internet', 'telefono', 'celular', 'cable', 'recibos',
    'utilities', 'electricity', 'water', 'phone', 'bills', 'power',
  ],
  salud: ['salud', 'medicina', 'medicinas', 'farmacia', 'doctor', 'medico', 'hospital', 'dentista', 'health', 'pharmacy', 'medical', 'dentist'],
  entretenimiento: [
    'ocio', 'entretenimiento', 'cine', 'netflix', 'streaming', 'salidas', 'diversion',
    'leisure', 'entertainment', 'fun', 'movies', 'hobbies',
  ],
  compras: ['compras', 'ropa', 'zapatos', 'regalos', 'shopping', 'clothes', 'clothing', 'gifts'],
  educacion: ['educacion', 'escuela', 'colegio', 'universidad', 'cursos', 'libros', 'education', 'school', 'tuition', 'books', 'courses'],
  otros: ['otros', 'otro', 'varios', 'misc', 'miscellaneous', 'other', 'others'],
  salario: ['salario', 'sueldo', 'quincena', 'salary', 'paycheck', 'payroll', 'wages'],
  extra: ['ingreso extra', 'extra', 'freelance', 'bono', 'aguinaldo', 'bonus', 'side income', 'otros ingresos', 'other income'],
};

/**
 * Category for a free-text label: an exact name first, then any known word
 * inside it ("Pago de luz" → servicios). `type` restricts the search when known.
 */
export function matchCategory(label: Cell, categories: CategoryRef[], type: TxType | null): CategoryRef | null {
  const n = normalize(label);
  if (!n) return null;
  const pool = type ? categories.filter((c) => c.type === type) : categories;
  const wordsOf = (c: CategoryRef) => [...c.names.map(normalize), c.id, ...(SYNONYMS[c.id] ?? [])].filter(Boolean);

  const exact = pool.find((c) => wordsOf(c).includes(n));
  if (exact) return exact;

  let best: { cat: CategoryRef; len: number } | null = null;
  const padded = ` ${n} `;
  for (const c of pool) {
    for (const w of wordsOf(c)) {
      if (padded.includes(` ${w} `) && (!best || w.length > best.len)) best = { cat: c, len: w.length };
    }
  }
  return best?.cat ?? null;
}

// ---------- Sheets ----------

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max).trimEnd() : s);

function parseBudgetSheet(sheet: Sheet, start: number, cols: { category: number; amount: number }, categories: CategoryRef[], plan: ImportPlan) {
  sheet.rows.slice(start).forEach((row, i) => {
    const rowNumber = start + i + 1;
    const label = cellText(row[cols.category]);
    if (!label) return;
    // A category listed without an amount (like in the template) is simply left out.
    if (isBlank(row[cols.amount])) return;
    const cents = parseMoney(row[cols.amount]);
    if (cents === null) return void plan.skipped.push({ sheet: sheet.name, row: rowNumber, reason: 'amount' });
    const cat = matchCategory(label, categories, 'expense');
    plan.budgets.push({
      key: `${sheet.name}:${rowNumber}`,
      sheet: sheet.name,
      row: rowNumber,
      label,
      categoryId: cat?.id ?? FALLBACK_CATEGORY.expense,
      matched: !!cat,
      cents: Math.abs(cents),
    });
  });
}

function parseTransactionSheet(sheet: Sheet, start: number, cols: Columns, categories: CategoryRef[], lang: Lang, plan: ImportPlan) {
  const amountCol = (cols.amount ?? cols.budget) as number;
  const rows = sheet.rows.slice(start);
  // A bank-style sheet with no "type" column marks expenses with a minus sign.
  const signed = cols.type === undefined && rows.some((r) => (parseMoney(r[amountCol]) ?? 0) < 0);

  rows.forEach((row, i) => {
    if (row.every(isBlank)) return;
    const rowNumber = start + i + 1;
    const cents = parseMoney(row[amountCol]);
    if (cents === null) return void plan.skipped.push({ sheet: sheet.name, row: rowNumber, reason: 'amount' });
    const date = cols.date === undefined ? null : parseDate(row[cols.date], lang);
    if (!date) return void plan.skipped.push({ sheet: sheet.name, row: rowNumber, reason: 'date' });

    const label = cols.category === undefined ? '' : cellText(row[cols.category]);
    let type = cols.type === undefined ? null : parseType(row[cols.type]);
    if (!type && signed) type = cents < 0 ? 'expense' : 'income';
    if (!type) type = cents < 0 ? 'expense' : matchCategory(label, categories, null)?.type ?? 'expense';

    const cat = matchCategory(label, categories, type);
    const merchant = cols.merchant === undefined ? '' : cellText(row[cols.merchant]);
    const note = cols.note === undefined ? '' : cellText(row[cols.note]);
    plan.transactions.push({
      key: `${sheet.name}:${rowNumber}`,
      sheet: sheet.name,
      row: rowNumber,
      date,
      type,
      label,
      categoryId: cat?.id ?? FALLBACK_CATEGORY[type],
      matched: !!cat,
      merchant: merchant ? clip(merchant, 60) : null,
      note: note ? clip(note, 140) : null,
      cents: Math.abs(cents),
      duplicate: false,
    });
  });
}

/** Two columns of "text, amount" with no header: a plain budget list. */
function looksLikeBudgetList(rows: Cell[][]) {
  const filled = rows.filter((r) => !r.every(isBlank));
  return filled.length > 0 && filled.every((r) => cellText(r[0]) !== '' && parseMoney(r[1]) !== null);
}

/** Reads every sheet of a workbook. Sheets without recognizable data are ignored. */
export function parseSheets(sheets: Sheet[], categories: CategoryRef[], lang: Lang = 'es'): ImportPlan {
  const plan: ImportPlan = { budgets: [], transactions: [], skipped: [] };
  for (const sheet of sheets) {
    const header = findHeader(sheet.rows);
    if (!header) {
      if (looksLikeBudgetList(sheet.rows)) parseBudgetSheet(sheet, 0, { category: 0, amount: 1 }, categories, plan);
      continue;
    }
    const { columns, index } = header;
    const amount = columns.amount ?? columns.budget;
    if (columns.date !== undefined && amount !== undefined) {
      parseTransactionSheet(sheet, index + 1, columns, categories, lang, plan);
    } else if (columns.category !== undefined && amount !== undefined) {
      parseBudgetSheet(sheet, index + 1, { category: columns.category, amount }, categories, plan);
    }
  }
  return plan;
}

// ---------- Duplicates and totals ----------

export function transactionKey(t: { date: string; type: TxType; amount_cents?: number; cents?: number; merchant: string | null }) {
  return `${t.date}|${t.type}|${t.amount_cents ?? t.cents}|${normalize(t.merchant)}`;
}

/** Flags rows already saved in the app, so importing the same file twice adds nothing. */
export function markDuplicates(plan: ImportPlan, existing: Set<string>): ImportPlan {
  return { ...plan, transactions: plan.transactions.map((t) => ({ ...t, duplicate: existing.has(transactionKey(t)) })) };
}

/** Budget per category; rows that land on the same category add up ("Luz" + "Agua" → Servicios). */
export function budgetTotals(rows: BudgetRow[]) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.cents);
  return totals;
}
