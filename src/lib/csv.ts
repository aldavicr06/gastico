import type { TransactionWithCategory } from './db';

/**
 * Quote a text cell. Cells starting with = + - @ (or tab / carriage return)
 * get a leading apostrophe so Excel and Sheets show them as text instead of
 * running them as formulas (CSV injection). Merchants can come from scanned
 * receipts, so this text is not trusted.
 */
export function csvText(value: string | null) {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

/** UTF-8 BOM + CRLF so Excel opens it with tildes and ₡ intact. */
export function transactionsToCsv(rows: TransactionWithCategory[]) {
  const lines = [
    'fecha,tipo,categoria,comercio,nota,monto,origen',
    ...rows.map((r) =>
      [
        r.date,
        r.type === 'expense' ? 'gasto' : 'ingreso',
        csvText(r.category_name),
        csvText(r.merchant),
        csvText(r.note),
        (r.amount_cents / 100).toFixed(2),
        r.source,
      ].join(','),
    ),
  ];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
