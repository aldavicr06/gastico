// Run with: npm run test:import (after the parser tests)
// The Excel template must read back cleanly: blank amounts import nothing,
// and once filled in, every row is recognized.
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { STRINGS } from '../src/lib/i18n.ts';
import { parseSheets, type CategoryRef } from '../src/lib/import.ts';
import { buildTemplate, parseCsv, readSpreadsheet } from '../src/lib/spreadsheet.ts';

const ids = ['super', 'comida', 'transporte', 'casa', 'servicios', 'salud', 'entretenimiento', 'compras', 'educacion', 'otros'];
const refs: CategoryRef[] = [...ids, 'salario', 'extra'].map((id) => ({
  id,
  type: id === 'salario' || id === 'extra' ? 'income' : 'expense',
  names: [STRINGS.es.categories[id], STRINGS.en.categories[id]],
}));

for (const lang of ['es', 'en'] as const) {
  const t = STRINGS[lang];
  const bytes = buildTemplate(t, ids.map((id) => t.categories[id]));

  const empty = parseSheets(readSpreadsheet('template.xlsx', { bytes }), refs, lang);
  assert.deepEqual([empty.budgets.length, empty.transactions.length, empty.skipped.length], [0, 0, 0], `${lang}: empty template imports nothing`);

  // Fill it in like a user would, then read it back.
  const wb = XLSX.read(bytes, { type: 'array' });
  const budget = wb.Sheets[t.importer.template.budgetSheet];
  XLSX.utils.sheet_add_aoa(budget, [[150000], [70000]], { origin: 'B2' });
  XLSX.utils.sheet_add_aoa(wb.Sheets[t.importer.template.transactionsSheet], [
    ['2026-11-19', lang === 'es' ? 'Gasto' : 'Expense', t.categories.super, 'Store', '', 76.9],
  ], { origin: 'A2' });
  const filled = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const plan = parseSheets(readSpreadsheet('template.xlsx', { bytes: filled }), refs, lang);
  assert.deepEqual(plan.budgets.map((b) => [b.categoryId, b.matched, b.cents]), [['super', true, 15000000], ['comida', true, 7000000]]);
  assert.deepEqual(plan.transactions.map((x) => [x.date, x.type, x.categoryId, x.cents]), [['2026-11-19', 'expense', 'super', 7690]]);
}

// CSV parsing: quotes, doubled quotes, semicolons, BOM, CRLF.
assert.deepEqual(parseCsv('﻿a;b;c\r\n"x;1";"say ""hi""";3\r\n'), [['a', 'b', 'c'], ['x;1', 'say "hi"', '3']]);
assert.deepEqual(parseCsv('fecha,monto\n2026-11-19,"1,500.00"\n'), [['fecha', 'monto'], ['2026-11-19', '1,500.00']]);

console.log('✓ excel template + csv reader: all tests passed');
