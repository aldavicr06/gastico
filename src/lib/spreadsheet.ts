import * as XLSX from 'xlsx';
import type { Cell, Sheet } from './import';
import type { Strings } from './i18n';

/**
 * Splits CSV text into rows. Handles quotes, doubled quotes, CRLF, a UTF-8
 * BOM, and the delimiter Excel uses in each region (comma, or semicolon in
 * Spanish locales), detected from the first line.
 */
export function parseCsv(text: string): Cell[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = [';', '\t', ','].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');

  const rows: Cell[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const isCsv = (name: string) => /\.(csv|txt|tsv)$/i.test(name);

/** Reads an .xlsx / .xls / .ods / .csv file into sheets of raw cells. */
export function readSpreadsheet(name: string, data: { bytes?: Uint8Array; text?: string }): Sheet[] {
  if (isCsv(name)) return [{ name, rows: parseCsv(data.text ?? '') }];
  // raw: true keeps numbers as numbers and dates as Excel serials (parsed in import.ts),
  // which avoids the time-zone shifts of JS Date objects.
  const wb = XLSX.read(data.bytes, { type: 'array', cellDates: false });
  return wb.SheetNames.map((sheetName) => ({
    name: sheetName,
    rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: true }),
  }));
}

export { isCsv };

/**
 * Template workbook: instructions, a budget sheet listing every expense
 * category (amounts left blank to fill in), and an empty transactions sheet
 * with the right columns. Labels follow the app's language.
 */
export function buildTemplate(t: Strings, categoryNames: string[]): Uint8Array {
  const tpl = t.importer.template;
  const wb = XLSX.utils.book_new();

  const howTo = XLSX.utils.aoa_to_sheet(tpl.instructions.map((line) => [line]));
  howTo['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, howTo, tpl.howToSheet);

  const budget = XLSX.utils.aoa_to_sheet([tpl.budgetHeader, ...categoryNames.map((n) => [n, null])]);
  budget['!cols'] = [{ wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, budget, tpl.budgetSheet);

  // Header only: an example row would be imported if left in. The example is in the instructions.
  const txs = XLSX.utils.aoa_to_sheet([tpl.transactionsHeader]);
  txs['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 26 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, txs, tpl.transactionsSheet);

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}
