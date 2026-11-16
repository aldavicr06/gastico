// Run with: npm run test:receipt
import assert from 'node:assert/strict';
import { parseAmount, parseReceipt } from '../src/lib/receipt.ts';

const today = new Date('2026-11-15');

assert.deepEqual(
  ['12,345.67', '12.345,67', '5.000', '₡ 8 500,00', '1500', '12,5'].map(parseAmount),
  [12345.67, 12345.67, 5000, 8500, 1500, 12.5],
);

const factura = parseReceipt(
  ['AUTO MERCADO S.A.', 'Cédula Jurídica 3-101-012345', 'Tel: 2257-4242', 'Factura Electrónica',
   'Fecha: 14/11/2026 18:22', 'Leche 2L   1.850,00', 'Subtotal  18.230,50', 'Total IVA 2.369,97',
   'TOTAL COMPROBANTE', '₡20.600,47', 'Efectivo 25.000,00', 'Vuelto 4.399,53'],
  today,
);
assert.equal(factura.total, 20600.47);
assert.equal(factura.date, '2026-11-14');
assert.equal(factura.suggestedCategory, 'super');

const voucher = parseReceipt(
  ['BAC CREDOMATIC', 'COMERCIO: SERVICENTRO LA GALERA', 'TERMINAL 00123456', 'LOTE 045 REF 778899',
   'VENTA', '15/11/26 10:03', 'MONTO: CRC 25,000.00', 'AUT 123456'],
  today,
);
assert.equal(voucher.total, 25000);
assert.equal(voucher.merchant, 'Servicentro La Galera');
assert.equal(voucher.suggestedCategory, 'transporte');

const soda = parseReceipt(['Soda La Tía', 'Casado pollo 3500', 'Fresco 1000', 'Total: 4500'], today);
assert.equal(soda.total, 4500);
assert.equal(soda.suggestedCategory, 'comida');

const sinEtiqueta = parseReceipt(['FARMACIA FISCHEL', 'Acetaminofen 2,450.00', 'Vitaminas 8,900.00', '11,350.00'], today);
assert.equal(sinEtiqueta.total, 11350);
assert.equal(sinEtiqueta.totalSource, 'largest');

console.log('✓ receipt parser: all tests passed');
