import type { SQLiteDatabase } from 'expo-sqlite';
import { toISODate } from './format';

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

export function setBudget(db: SQLiteDatabase, categoryId: string, cents: number | null) {
  return db.runAsync('UPDATE categories SET budget_cents = ? WHERE id = ?', cents, categoryId);
}

// ---------- Transactions ----------

export type NewTransaction = Omit<Transaction, 'id' | 'created_at'>;

export async function addTransaction(db: SQLiteDatabase, tx: NewTransaction) {
  const r = await db.runAsync(
    `INSERT INTO transactions (type, amount_cents, category_id, note, merchant, date, source, receipt_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    tx.type, tx.amount_cents, tx.category_id, tx.note, tx.merchant, tx.date, tx.source, tx.receipt_uri,
  );
  return r.lastInsertRowId;
}

export function getTransaction(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', id);
}

/** Editable fields only; source, receipt and created_at keep their values. */
export type TransactionEdit = Pick<Transaction, 'type' | 'amount_cents' | 'category_id' | 'note' | 'merchant' | 'date'>;

export function updateTransaction(db: SQLiteDatabase, id: number, tx: TransactionEdit) {
  return db.runAsync(
    `UPDATE transactions
     SET type = ?, amount_cents = ?, category_id = ?, note = ?, merchant = ?, date = ?
     WHERE id = ?`,
    tx.type, tx.amount_cents, tx.category_id, tx.note, tx.merchant, tx.date, id,
  );
}

export function deleteTransaction(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

/** Puts a deleted transaction back exactly as it was (same id), for "Deshacer". */
export function restoreTransaction(db: SQLiteDatabase, tx: Transaction) {
  return db.runAsync(
    `INSERT OR REPLACE INTO transactions
       (id, type, amount_cents, category_id, note, merchant, date, source, receipt_uri, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tx.id, tx.type, tx.amount_cents, tx.category_id, tx.note, tx.merchant, tx.date, tx.source, tx.receipt_uri, tx.created_at,
  );
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
}

/**
 * Fills the app with ~2 months of realistic Costa Rican spending so the
 * screens look alive for screenshots.
 */
export async function seedDemoData(db: SQLiteDatabase) {
  await clearTransactions(db);

  const budgets: Record<string, number> = {
    super: 180000, comida: 70000, transporte: 60000, casa: 40000, servicios: 55000,
    salud: 25000, entretenimiento: 30000, compras: 40000,
  };
  for (const [id, colones] of Object.entries(budgets)) await setBudget(db, id, colones * 100);

  type Seed = [daysAgo: number, cat: string, colones: number, merchant: string, source?: 'scan'];
  const thisMonth: Seed[] = [
    [0, 'comida', 4500, 'Soda La Tía'],
    [0, 'transporte', 25000, 'Servicentro La Galera', 'scan'],
    [1, 'super', 38450, 'Auto Mercado', 'scan'],
    [1, 'entretenimiento', 7990, 'Netflix'],
    [2, 'comida', 6200, 'Starbucks'],
    [3, 'salud', 11350, 'Farmacia Fischel', 'scan'],
    [4, 'transporte', 3800, 'Uber'],
    [5, 'super', 22780, 'Más x Menos', 'scan'],
    [6, 'servicios', 18900, 'Kölbi'],
    [7, 'comida', 12800, 'Pizza Hut'],
    [8, 'casa', 15600, 'EPA', 'scan'],
    [9, 'compras', 24900, 'Pequeño Mundo'],
    [10, 'super', 41200, 'PriceSmart', 'scan'],
    [11, 'servicios', 23450, 'CNFL'],
    [12, 'transporte', 20000, 'Servicentro Delta'],
    [13, 'entretenimiento', 9500, 'Cinépolis'],
    [14, 'comida', 3200, 'Panadería Musmanni'],
  ];
  const lastMonth: Seed[] = [
    [33, 'super', 52300, 'Auto Mercado'], [36, 'comida', 15400, 'Restaurante Tin Jo'],
    [38, 'transporte', 30000, 'Servicentro La Galera'], [40, 'servicios', 41200, 'ICE'],
    [42, 'casa', 28000, 'Construplaza'], [45, 'super', 36100, 'Walmart'],
    [48, 'salud', 18000, 'Clínica Bíblica'], [50, 'compras', 35500, 'Siman'],
    [52, 'entretenimiento', 12000, 'Teatro Nacional'], [55, 'comida', 8900, 'KFC'],
  ];

  const now = new Date();
  const dateFor = (daysAgo: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return toISODate(d);
  };
  const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const prevMonthStart = toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  await db.withTransactionAsync(async () => {
    for (const [daysAgo, cat, colones, merchant, source] of [...thisMonth, ...lastMonth]) {
      const date = dateFor(daysAgo);
      // Keep "this month" seeds inside the current month even early in the month.
      const safeDate = daysAgo < 30 && date < monthStart ? monthStart : date;
      await addTransaction(db, {
        type: 'expense',
        amount_cents: colones * 100,
        category_id: cat,
        note: null,
        merchant,
        date: safeDate,
        source: source ?? 'manual',
        receipt_uri: null,
      });
    }
    await addTransaction(db, {
      type: 'income', amount_cents: 850000 * 100, category_id: 'salario', note: 'Quincena',
      merchant: null, date: monthStart, source: 'manual', receipt_uri: null,
    });
    await addTransaction(db, {
      type: 'income', amount_cents: 120000 * 100, category_id: 'extra', note: 'Proyecto freelance',
      merchant: null, date: dateFor(4) < monthStart ? monthStart : dateFor(4), source: 'manual', receipt_uri: null,
    });
    await addTransaction(db, {
      type: 'income', amount_cents: 850000 * 100, category_id: 'salario', note: 'Quincena',
      merchant: null, date: prevMonthStart, source: 'manual', receipt_uri: null,
    });
  });
}
