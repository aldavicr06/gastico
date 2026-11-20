import type { SQLiteDatabase } from 'expo-sqlite';
import { currencyFor, type Lang } from './i18n';
import { toISODate, type Currency } from './format';

export type TxType = 'expense' | 'income';

export type Category = {
  id: string;
  name: string;
  icon: string; // Ionicons name
  color: string;
  type: TxType;
  budget_cents: number | null;
};

export type Transaction = {
  id: number;
  type: TxType;
  amount_cents: number;
  category_id: string;
  note: string | null;
  merchant: string | null;
  date: string; // YYYY-MM-DD
  source: 'manual' | 'scan';
  receipt_uri: string | null;
  created_at: string;
};

export type TransactionWithCategory = Transaction & {
  category_name: string;
  category_icon: string;
  category_color: string;
};

const DEFAULT_CATEGORIES: Omit<Category, 'budget_cents'>[] = [
  { id: 'super', name: 'Súper', icon: 'cart', color: '#22C55E', type: 'expense' },
  { id: 'comida', name: 'Comida', icon: 'fast-food', color: '#F97316', type: 'expense' },
  { id: 'transporte', name: 'Transporte', icon: 'car-sport', color: '#3B82F6', type: 'expense' },
  { id: 'casa', name: 'Casa', icon: 'home', color: '#A855F7', type: 'expense' },
  { id: 'servicios', name: 'Servicios', icon: 'flash', color: '#EAB308', type: 'expense' },
  { id: 'salud', name: 'Salud', icon: 'medkit', color: '#EF4444', type: 'expense' },
  { id: 'entretenimiento', name: 'Ocio', icon: 'game-controller', color: '#EC4899', type: 'expense' },
  { id: 'compras', name: 'Compras', icon: 'bag-handle', color: '#14B8A6', type: 'expense' },
  { id: 'educacion', name: 'Educación', icon: 'school', color: '#6366F1', type: 'expense' },
  { id: 'otros', name: 'Otros', icon: 'ellipsis-horizontal', color: '#64748B', type: 'expense' },
  { id: 'salario', name: 'Salario', icon: 'cash', color: '#10B981', type: 'income' },
  { id: 'extra', name: 'Ingreso extra', icon: 'trending-up', color: '#0EA5E9', type: 'income' },
];

const DB_VERSION = 1;

/** Called once by <SQLiteProvider onInit>. Creates / migrates the schema. */
export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= DB_VERSION) return;

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense','income')),
      budget_cents INTEGER
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('expense','income')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category_id TEXT NOT NULL REFERENCES categories(id),
      note TEXT,
      merchant TEXT,
      date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      receipt_uri TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  for (const c of DEFAULT_CATEGORIES) {
    await db.runAsync(
      'INSERT OR IGNORE INTO categories (id, name, icon, color, type, budget_cents) VALUES (?, ?, ?, ?, ?, NULL)',
      c.id, c.name, c.icon, c.color, c.type,
    );
  }
  await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
}

// ---------- Categories ----------

export function getCategories(db: SQLiteDatabase, type?: TxType) {
  return type
    ? db.getAllAsync<Category>('SELECT * FROM categories WHERE type = ? ORDER BY rowid', type)
    : db.getAllAsync<Category>('SELECT * FROM categories ORDER BY rowid');
}

/**
 * Any change made by the user means the data is no longer the untouched demo,
 * so switching language must not replace it (see `seedDemoData`).
 */
function markUserData(db: SQLiteDatabase) {
  return setSetting(db, 'demo', '0');
}

/** True while the data is exactly the demo data, with no change by the user. */
export async function isUntouchedDemo(db: SQLiteDatabase) {
  return (await getSettings(db)).demo === '1';
}

export async function setBudget(db: SQLiteDatabase, categoryId: string, cents: number | null) {
  await db.runAsync('UPDATE categories SET budget_cents = ? WHERE id = ?', cents, categoryId);
  await markUserData(db);
}

// ---------- Transactions ----------

export type NewTransaction = Omit<Transaction, 'id' | 'created_at'>;

export async function addTransaction(db: SQLiteDatabase, tx: NewTransaction) {
  const r = await db.runAsync(
    `INSERT INTO transactions (type, amount_cents, category_id, note, merchant, date, source, receipt_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    tx.type, tx.amount_cents, tx.category_id, tx.note, tx.merchant, tx.date, tx.source, tx.receipt_uri,
  );
  await markUserData(db);
  return r.lastInsertRowId;
}

export function getTransaction(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', id);
}

/** Editable fields only; source, receipt and created_at keep their values. */
export type TransactionEdit = Pick<Transaction, 'type' | 'amount_cents' | 'category_id' | 'note' | 'merchant' | 'date'>;

export async function updateTransaction(db: SQLiteDatabase, id: number, tx: TransactionEdit) {
  await db.runAsync(
    `UPDATE transactions
     SET type = ?, amount_cents = ?, category_id = ?, note = ?, merchant = ?, date = ?
     WHERE id = ?`,
    tx.type, tx.amount_cents, tx.category_id, tx.note, tx.merchant, tx.date, id,
  );
  await markUserData(db);
}

export async function deleteTransaction(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
  await markUserData(db);
}

/** Puts a deleted transaction back exactly as it was (same id), for "Deshacer". */
export async function restoreTransaction(db: SQLiteDatabase, tx: Transaction) {
  await db.runAsync(
    `INSERT OR REPLACE INTO transactions
       (id, type, amount_cents, category_id, note, merchant, date, source, receipt_uri, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tx.id, tx.type, tx.amount_cents, tx.category_id, tx.note, tx.merchant, tx.date, tx.source, tx.receipt_uri, tx.created_at,
  );
  await markUserData(db);
}

/** Total expenses between two ISO dates, inclusive. */
export async function getExpenseTotal(db: SQLiteDatabase, from: string, to: string) {
  const r = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(amount_cents) AS total FROM transactions WHERE type = 'expense' AND date BETWEEN ? AND ?",
    from, to,
  );
  return r?.total ?? 0;
}

/** Budget and spending of one category in a month ('YYYY-MM'). */
export async function getCategoryMonth(db: SQLiteDatabase, categoryId: string, month: string) {
  const r = await db.getFirstAsync<{ name: string; budget_cents: number | null; spent: number | null }>(
    `SELECT c.name, c.budget_cents,
       (SELECT SUM(amount_cents) FROM transactions
        WHERE category_id = c.id AND type = 'expense' AND substr(date, 1, 7) = ?) AS spent
     FROM categories c WHERE c.id = ?`,
    month, categoryId,
  );
  return r ? { name: r.name, budget_cents: r.budget_cents, spent_cents: r.spent ?? 0 } : null;
}

/** Month is 'YYYY-MM'. */
export function getTransactionsForMonth(db: SQLiteDatabase, month: string, limit = 1000) {
  return db.getAllAsync<TransactionWithCategory>(
    `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE substr(t.date, 1, 7) = ?
     ORDER BY t.date DESC, t.id DESC
     LIMIT ?`,
    month, limit,
  );
}

export async function countTransactions(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
  return r?.n ?? 0;
}

export function getAllTransactions(db: SQLiteDatabase) {
  return db.getAllAsync<TransactionWithCategory>(
    `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM transactions t JOIN categories c ON c.id = t.category_id
     ORDER BY t.date DESC, t.id DESC`,
  );
}

export type MonthSummary = {
  income_cents: number;
  expense_cents: number;
  budget_cents: number;
  byCategory: (Category & { spent_cents: number })[];
};

export async function getMonthSummary(db: SQLiteDatabase, month: string): Promise<MonthSummary> {
  const totals = await db.getFirstAsync<{ income: number | null; expense: number | null }>(
    `SELECT
       SUM(CASE WHEN type = 'income' THEN amount_cents END) AS income,
       SUM(CASE WHEN type = 'expense' THEN amount_cents END) AS expense
     FROM transactions WHERE substr(date, 1, 7) = ?`,
    month,
  );
  const byCategory = await db.getAllAsync<Category & { spent_cents: number }>(
    `SELECT c.*, COALESCE(SUM(t.amount_cents), 0) AS spent_cents
     FROM categories c
     LEFT JOIN transactions t ON t.category_id = c.id AND substr(t.date, 1, 7) = ?
     WHERE c.type = 'expense'
     GROUP BY c.id
     ORDER BY spent_cents DESC`,
    month,
  );
  const budget_cents = byCategory.reduce((s, c) => s + (c.budget_cents ?? 0), 0);
  return {
    income_cents: totals?.income ?? 0,
    expense_cents: totals?.expense ?? 0,
    budget_cents,
    byCategory,
  };
}

// ---------- Settings ----------

export async function getSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(db: SQLiteDatabase, key: string, value: string) {
  return db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

// ---------- Demo data ----------

export async function clearTransactions(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM transactions');
  await markUserData(db);
}

/** Roughly 500 colones per dollar, so demo amounts look realistic in either currency. */
const CRC_PER_USD = 500;

/**
 * Fills the app with ~2 months of realistic spending so the screens look alive
 * for screenshots: Costa Rican stores (es) or US stores (en), with amounts in
 * colones or dollars (by default the language's currency).
 * Returns the currency the amounts are in.
 */
export async function seedDemoData(db: SQLiteDatabase, lang: Lang = 'es', currency: Currency = currencyFor(lang)) {
  const cents = (colones: number) =>
    currency === 'USD' ? Math.round((colones * 100) / CRC_PER_USD) : colones * 100;
  await clearTransactions(db);

  const budgets: Record<string, number> = {
    super: 180000, comida: 70000, transporte: 60000, casa: 40000, servicios: 55000,
    salud: 25000, entretenimiento: 30000, compras: 40000,
  };
  for (const [id, colones] of Object.entries(budgets)) await setBudget(db, id, cents(colones));

  type Seed = [daysAgo: number, cat: string, colones: number, merchantEs: string, merchantEn: string, source?: 'scan'];
  const thisMonth: Seed[] = [
    [0, 'comida', 4500, 'Soda La Tía', "Joe's Diner"],
    [0, 'transporte', 25000, 'Servicentro La Galera', 'Shell', 'scan'],
    [1, 'super', 38450, 'Auto Mercado', 'Whole Foods', 'scan'],
    [1, 'entretenimiento', 7990, 'Netflix', 'Netflix'],
    [2, 'comida', 6200, 'Starbucks', 'Starbucks'],
    [3, 'salud', 11350, 'Farmacia Fischel', 'CVS Pharmacy', 'scan'],
    [4, 'transporte', 3800, 'Uber', 'Uber'],
    [5, 'super', 22780, 'Más x Menos', 'Kroger', 'scan'],
    [6, 'servicios', 18900, 'Kölbi', 'Verizon'],
    [7, 'comida', 12800, 'Pizza Hut', 'Pizza Hut'],
    [8, 'casa', 15600, 'EPA', 'The Home Depot', 'scan'],
    [9, 'compras', 24900, 'Pequeño Mundo', 'Target'],
    [10, 'super', 41200, 'PriceSmart', 'Costco', 'scan'],
    [11, 'servicios', 23450, 'CNFL', 'Con Edison'],
    [12, 'transporte', 20000, 'Servicentro Delta', 'Chevron'],
    [13, 'entretenimiento', 9500, 'Cinépolis', 'AMC Theatres'],
    [14, 'comida', 3200, 'Panadería Musmanni', 'Panera Bread'],
  ];
  const lastMonth: Seed[] = [
    [33, 'super', 52300, 'Auto Mercado', 'Whole Foods'], [36, 'comida', 15400, 'Restaurante Tin Jo', 'Olive Garden'],
    [38, 'transporte', 30000, 'Servicentro La Galera', 'Shell'], [40, 'servicios', 41200, 'ICE', 'Comcast'],
    [42, 'casa', 28000, 'Construplaza', "Lowe's"], [45, 'super', 36100, 'Walmart', 'Walmart'],
    [48, 'salud', 18000, 'Clínica Bíblica', 'Urgent Care'], [50, 'compras', 35500, 'Siman', "Macy's"],
    [52, 'entretenimiento', 12000, 'Teatro Nacional', 'Broadway show'], [55, 'comida', 8900, 'KFC', 'KFC'],
  ];
  const paycheck = lang === 'en' ? 'Paycheck' : 'Quincena';

  const now = new Date();
  const dateFor = (daysAgo: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return toISODate(d);
  };
  const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const prevMonthStart = toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  await db.withTransactionAsync(async () => {
    for (const [daysAgo, cat, colones, merchantEs, merchantEn, source] of [...thisMonth, ...lastMonth]) {
      const date = dateFor(daysAgo);
      // Keep "this month" seeds inside the current month even early in the month.
      const safeDate = daysAgo < 30 && date < monthStart ? monthStart : date;
      await addTransaction(db, {
        type: 'expense',
        amount_cents: cents(colones),
        category_id: cat,
        note: null,
        merchant: lang === 'en' ? merchantEn : merchantEs,
        date: safeDate,
        source: source ?? 'manual',
        receipt_uri: null,
      });
    }
    await addTransaction(db, {
      type: 'income', amount_cents: cents(850000), category_id: 'salario', note: paycheck,
      merchant: null, date: monthStart, source: 'manual', receipt_uri: null,
    });
    await addTransaction(db, {
      type: 'income', amount_cents: cents(120000), category_id: 'extra', note: lang === 'en' ? 'Freelance project' : 'Proyecto freelance',
      merchant: null, date: dateFor(4) < monthStart ? monthStart : dateFor(4), source: 'manual', receipt_uri: null,
    });
    await addTransaction(db, {
      type: 'income', amount_cents: cents(850000), category_id: 'salario', note: paycheck,
      merchant: null, date: prevMonthStart, source: 'manual', receipt_uri: null,
    });
  });
  // Last, so the writes above (which mark user data) don't undo it.
  await setSetting(db, 'demo', '1');
  return currency;
}
