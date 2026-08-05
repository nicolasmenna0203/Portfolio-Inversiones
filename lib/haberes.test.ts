import { describe, it, expect } from 'vitest';
import { parseHaberesText, limpiarEmpleador } from './haberes';

describe('limpiarEmpleador', () => {
  it('saca CUIT y código de lote pegado al nombre', () => {
    expect(limpiarEmpleador('30503317814 240130007renault argentina sa')).toBe('renault argentina sa');
  });

  it('saca el dígito de sufijo pegado a la última palabra', () => {
    expect(limpiarEmpleador('30503317814 240228007renault argentina sa2')).toBe('renault argentina sa');
  });

  it('saca "cuit" y el CUIT cuando aparecen después del nombre', () => {
    expect(limpiarEmpleador('240327007renault argentina sa cuit 30503317814')).toBe('renault argentina sa');
  });

  it('cae a "CUIT <número>" cuando el pago es DEBIN y no hay nombre de empleador', () => {
    expect(limpiarEmpleador('Id debin d4ro172vp1rr8p802kj3qe cuit 30712249338')).toBe('CUIT 30712249338');
  });
});

describe('parseHaberesText', () => {
  const sampleText = `SuperCuenta Mi resumen de cuenta NICOLAS MENNA CUIL: 20-43272108-7 Movimientos en pesos Fecha Comprobante Movimiento Caja de Ahorro en pesos Saldo en cuenta 13/01/24 Saldo Inicial $ 0,67 $ 0,67 31/01/24 67332701 Acreditacion de haberes 30503317814 240130007renault argentina sa $ 276.000,00 $ 276.000,67 31/01/24 67495399 Transferencia no gravada A nicolas alejandro menna / varios - var / 20432721087 -$ 276.000,00 $ 0,67 29/02/24 68817961 Acreditacion de haberes 30503317814 240228007renault argentina sa2 $ 367.200,00 $ 367.200,67 27/03/24 70551592 Acreditacion de haberes 240327007renault argentina sa cuit 30503317814 $ 349.000,00 $ 349.000,00 Movimientos en dólares No tenés movimientos en dólares en este período.`;

  it('extrae las acreditaciones de haberes con fecha, empleador y monto', () => {
    const { rows } = parseHaberesText(sampleText);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      fecha: '31/01/2024',
      empleador: 'renault argentina sa',
      montoArs: 276000,
      montoUsd: 0,
      concepto: 'Acreditacion de haberes',
    });
    expect(rows[1].montoArs).toBe(367200);
    expect(rows[2].fecha).toBe('27/03/2024');
  });

  it('ignora líneas que no son acreditación de haberes (ej. transferencias)', () => {
    const { rows } = parseHaberesText(sampleText);
    expect(rows.every((r) => r.concepto.toLowerCase().includes('haberes'))).toBe(true);
  });

  it('agrupa los meses detectados sin duplicados y ordenados', () => {
    const { mesesKeys } = parseHaberesText(sampleText);
    expect(mesesKeys).toEqual(['2024-01', '2024-02', '2024-03']);
  });

  it('tira error si no encuentra ninguna acreditación de haberes', () => {
    expect(() => parseHaberesText('sin movimientos relevantes acá')).toThrow(/No se encontraron/);
  });

  it('reconoce el formato DEBIN ("Acreditacion haberes debin", sin "de", sin nombre) usando el CUIT como empleador', () => {
    const debinText = `Infinity Mi resumen de cuenta NICOLAS MENNA Movimientos en pesos Fecha Comprobante Movimiento Cuenta sueldo en pesos Cuenta Corriente en pesos Saldo en cuenta 03/07/26 Saldo Inicial $ 0,40 $ 0,00 $ 0,40 08/07/26 89653638 Acreditacion haberes debin Id debin d4ro172vp1rr8p802kj3qe cuit 30712249338 $ 1.967.232,55 $ 1.967.233,37 12/07/26 94541228 Transf recibida cvu mismo titular De nicolas alejandro menna / mercado pago /2043 2721087 $ 345.750,00 $ 2.312.983,37`;
    const { rows } = parseHaberesText(debinText);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      fecha: '08/07/2026',
      empleador: 'CUIT 30712249338',
      montoArs: 1967232.55,
      montoUsd: 0,
      concepto: 'Acreditacion haberes debin',
    });
  });
});
