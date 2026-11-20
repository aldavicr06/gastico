// Run with: npm run test:import
import assert from 'node:assert/strict';
import {
  budgetTotals, markDuplicates, matchCategory, parseDate, parseMoney, parseSheets, transactionKey,
  type CategoryRef,
} from '../src/lib/import.ts';

const CATS: CategoryRef[] = [
  ['super', 'expense', 'Súper', 'Groceries'], ['comida', 'expense', 'Comida', 'Food'],
  ['transporte', 'expense', 'Transporte', 'Transport'], ['casa', 'expense', 'Casa', 'Home'],
  ['servicios', 'expense', 'Servicios', 'Utilities'], ['salud', 'expense', 'Salud', 'Health'],
  ['entretenimiento', 'expense', 'Ocio', 'Leisure'], ['compras', 'expense', 'Compras', 'Shopping'],
  ['educacion', 'expense', 'Educación', 'Education'], ['otros', 'expense', 'Otros', 'Other'],
  ['salario', 'income', 'Salario', 'Salary'], ['extra', 'income', 'Ingreso extra', 'Extra income'],
].map(([id, type, es, en]) => ({ id, type: type as 'expense' | 'income', names: [es, en] }));

// ---------- Amounts ----------
const money = ['180 000', '180,000', '180.000', '₡180.000,50', '$1,234.56', '1.234,56', '12,5', '12.50', 'CRC 25 000',
  '(500)', '-500', '−1 200', 1500, -12.5, '₡ 8 500,00', '1 234 567,89'].map(parseMoney);
assert.deepEqual(money, [18000000, 18000000, 18000000, 18000050, 123456, 123456, 1250, 1250, 2500000,
  -50000, -50000, -120000, 150000, -1250, 850000, 123456789]);
assert.equal(parseMoney(''), null);
assert.equal(parseMoney('abc'), null);
assert.equal(parseMoney(0), null);
assert.equal(parseMoney("'-500"), -50000, 'apostrophe from our CSV export is ignored');

// ---------- Dates ----------
assert.equal(parseDate('2026-11-19'), '2026-11-19');
assert.equal(parseDate('19/11/2026'), '2026-11-19');
assert.equal(parseDate('11/19/2026', 'en'), '2026-11-19');
assert.equal(parseDate('11/19/2026', 'es'), '2026-11-19', 'second number > 12 can only be the day');
assert.equal(parseDate('05/06/2026', 'es'), '2026-06-05', 'Spanish: day first');
assert.equal(parseDate('05/06/2026', 'en'), '2026-05-06', 'English: month first');
assert.equal(parseDate('3-1-26'), '2026-01-03');
assert.equal(parseDate(46345), '2026-11-19', 'Excel serial date');
assert.equal(parseDate('31/02/2026'), null);
assert.equal(parseDate('mañana'), null);

// ---------- Categories ----------
const cat = (label: string, type: 'expense' | 'income' | null = null) => matchCategory(label, CATS, type)?.id ?? null;
assert.equal(cat('super'), 'super');
assert.equal(cat('SÚPER'), 'super');
assert.equal(cat('Supermercado'), 'super');
assert.equal(cat('Groceries'), 'super');
assert.equal(cat('Pago de luz'), 'servicios');
assert.equal(cat('Agua'), 'servicios');
assert.equal(cat('Gasolina'), 'transporte');
assert.equal(cat('Educacion'), 'educacion');
assert.equal(cat('Quincena'), 'salario');
assert.equal(cat('Aguinaldo'), 'extra');
assert.equal(cat('Gasto extra', 'expense'), null, 'income words never match an expense');
assert.equal(cat('Mascotas'), null);

// ---------- Budget sheet with header (like the template), Spanish ----------
const budgetPlan = parseSheets([{
  name: 'Presupuesto',
  rows: [
    ['Mi presupuesto 2026'],
    [],
    ['Categoría', 'Presupuesto mensual (₡)'],
    ['Súper', '180 000'],
    ['Luz', 20000],
    ['Agua', '8.000'],
    ['Mascotas', '15 000'],
    ['Salud', null], // listed without amount: left out silently
    ['Transporte', 'mucho'],
  ],
}], CATS);
assert.deepEqual(budgetPlan.budgets.map((b) => [b.row, b.categoryId, b.matched, b.cents]), [
  [4, 'super', true, 18000000],
  [5, 'servicios', true, 2000000],
  [6, 'servicios', true, 800000],
  [7, 'otros', false, 1500000],
]);
assert.deepEqual(budgetPlan.skipped, [{ sheet: 'Presupuesto', row: 9, reason: 'amount' }]);
assert.equal(budgetTotals(budgetPlan.budgets).get('servicios'), 2800000, 'Luz + Agua add up');

// ---------- Budget list without any header ----------
const bare = parseSheets([{ name: 'Hoja1', rows: [['Comida', 70000], ['Ocio', '30 000']] }], CATS);
assert.deepEqual(bare.budgets.map((b) => [b.categoryId, b.cents]), [['comida', 7000000], ['entretenimiento', 3000000]]);

// ---------- Our own CSV export (round trip), English header ----------
const exported = parseSheets([{
  name: 'gastico.csv',
  rows: [
    ['date', 'type', 'category', 'merchant', 'note', 'amount', 'source'],
    ['2026-11-19', 'expense', 'Groceries', 'Whole Foods', '', '76.90', 'scan'],
    ['2026-11-01', 'income', 'Salary', '', 'Paycheck', '1700.00', 'manual'],
    ['2026-11-18', 'expense', 'Food', "'=HYPERLINK(\"x\")", '', '9.00', 'manual'],
  ],
}], CATS, 'en');
assert.deepEqual(
  exported.transactions.map((t) => [t.date, t.type, t.categoryId, t.merchant, t.note, t.cents]),
  [
    ['2026-11-19', 'expense', 'super', 'Whole Foods', null, 7690],
    ['2026-11-01', 'income', 'salario', null, 'Paycheck', 170000],
    ['2026-11-18', 'expense', 'comida', '=HYPERLINK("x")', null, 900],
  ],
);

// ---------- Bank-style sheet: no type column, minus sign = expense, Spanish dates ----------
const bank = parseSheets([{
  name: 'Movimientos',
  rows: [
    ['Fecha', 'Descripción', 'Categoría', 'Monto'],
    ['05/11/2026', 'Auto Mercado', 'Supermercado', '-38.450,00'],
    ['15/11/2026', 'Planilla', 'Sueldo', '425.000,00'],
    ['', '', '', ''],
    ['sin fecha', 'Uber', 'Transporte', '-3 800'],
    ['16/11/2026', 'Veterinaria', 'Mascotas', '-12 000'],
  ],
}], CATS, 'es');
assert.deepEqual(
  bank.transactions.map((t) => [t.date, t.type, t.categoryId, t.matched, t.note, t.cents]),
  [
    ['2026-11-05', 'expense', 'super', true, 'Auto Mercado', 3845000],
    ['2026-11-15', 'income', 'salario', true, 'Planilla', 42500000],
    ['2026-11-16', 'expense', 'otros', false, 'Veterinaria', 1200000],
  ],
);
assert.deepEqual(bank.skipped, [{ sheet: 'Movimientos', row: 5, reason: 'date' }]);

// ---------- Workbook with both sheets + an instructions sheet ----------
const both = parseSheets([
  { name: 'Instrucciones', rows: [['Llena las otras hojas.'], ['Los montos van en la moneda de la app.']] },
  { name: 'Presupuesto', rows: [['Categoría', 'Presupuesto mensual'], ['Casa', 40000]] },
  { name: 'Movimientos', rows: [['Fecha', 'Tipo', 'Categoría', 'Comercio', 'Nota', 'Monto'], ['2026-11-10', 'Gasto', 'Casa', 'EPA', '', 15600]] },
], CATS);
assert.equal(both.budgets.length, 1);
assert.equal(both.transactions.length, 1);
assert.equal(both.transactions[0].merchant, 'EPA');

// ---------- Duplicates ----------
const existing = new Set([transactionKey({ date: '2026-11-19', type: 'expense', amount_cents: 7690, merchant: 'WHOLE FOODS' })]);
const marked = markDuplicates(exported, existing);
assert.deepEqual(marked.transactions.map((t) => t.duplicate), [true, false, false]);

console.log('✓ import parser: all tests passed');
