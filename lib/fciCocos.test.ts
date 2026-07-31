import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Fixture: .xlsx mínimo construido a mano (ZIP sin comprimir + XML de una sola hoja) ──
// Mismo formato de fila/celda que la Planilla Diaria real de CAFCI: celdas de
// texto inline (t="str"), columna A nombre de fondo+clase, B moneda, D horizonte,
// E fecha, F VCP, H var% diaria, J/K/L rendimientos, O patrimonio.

function crc32(buf: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function buildXlsxFixture(sheetXml: string): Buffer {
  const content = Buffer.from(sheetXml, 'utf8');
  const name = Buffer.from('xl/worksheets/sheet1.xml', 'utf8');
  const crc = crc32(content);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8); // stored, sin compresión
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(content.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const local = Buffer.concat([localHeader, name, content]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10); // stored
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42); // localHeaderOffset
  const centralEntry = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralEntry.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, centralEntry, eocd]);
}

function celda(ref: string, valor: string, esTexto: boolean): string {
  return esTexto
    ? `<c r="${ref}" t="str"><v>${valor}</v></c>`
    : `<c r="${ref}"><v>${valor}</v></c>`;
}

const SHEET_XML =
  '<?xml version="1.0"?><worksheet><sheetData>' +
  '<row r="8">' +
  celda('A8', 'Fondo', true) + celda('B8', 'Moneda', true) +
  '</row>' +
  '<row r="2789">' +
  celda('A2789', 'Cocos Rendimiento - Clase A', true) +
  celda('B2789', 'ARS', true) +
  celda('D2789', 'Med', true) +
  celda('E2789', '30/07/26', true) +
  celda('F2789', '11459.416', false) +
  celda('H2789', '0.052', false) +
  celda('J2789', '1.614', false) +
  celda('K2789', '14.276', false) +
  celda('L2789', '32.188', false) +
  celda('O2789', '266846461064.28', false) +
  '</row>' +
  '<row r="9000">' +
  celda('A9000', 'Otro Fondo No-Cocos - Clase A', true) +
  celda('F9000', '1000', false) +
  '</row>' +
  '</sheetData></worksheet>';

describe('fetchFciMetrics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('parsea VCP y rendimientos del fondo mapeado, ignorando fondos de otras gestoras', async () => {
    const xlsxBuf = buildXlsxFixture(SHEET_XML);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength),
    }));

    const { fetchFciMetrics } = await import('./fciCocos');
    const metrics = await fetchFciMetrics();

    expect(metrics.size).toBe(1); // solo COCORMA está en el fixture; los otros 3 tickers mapeados no aparecen
    const rma = metrics.get('COCORMA');
    expect(rma).toBeDefined();
    expect(rma?.nombreFondo).toBe('Cocos Rendimiento - Clase A');
    expect(rma?.moneda).toBe('ARS');
    expect(rma?.vcp).toBeCloseTo(11459.416);
    expect(rma?.variacionDiaria).toBeCloseTo(0.00052);
    expect(rma?.rendimientoMes).toBeCloseTo(0.01614);
    expect(rma?.rendimiento12Meses).toBeCloseTo(0.32188);
    expect(rma?.patrimonio).toBeCloseTo(266846461064.28);
  });

  it('propaga error si la respuesta HTTP no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { fetchFciMetrics } = await import('./fciCocos');
    await expect(fetchFciMetrics()).rejects.toThrow('503');
  });
});
