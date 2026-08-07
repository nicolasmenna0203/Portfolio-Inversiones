import { describe, it, expect } from 'vitest';
import { calcularMetricasProvinciales, TIR_REFERENCIA, TICKERS_PROVINCIALES } from './bonosProvinciales';

// Precios reales de data912 al 2026-08-06, la misma fecha de las TIR de
// referencia de Docta/argen.bond — comparar contra TIRs de otra fecha no
// probaría nada.
const PRECIOS = { PBA27: 100.25, PBA28: 109.20, PR17: 640.00 };
const HOY = new Date('2026-08-06T00:00:00Z');

describe('calcularMetricasProvinciales', () => {
  it('devuelve los tres bonos con TIR y duration positivas', () => {
    const m = calcularMetricasProvinciales(PRECIOS, HOY);
    expect(m.map((b) => b.ticker).sort()).toEqual([...TICKERS_PROVINCIALES].sort());
    for (const b of m) {
      expect(b.tir).toBeGreaterThan(0);
      expect(b.modifiedDuration).toBeGreaterThan(0);
      expect(b.calculoPropio).toBe(true);
    }
  });

  it('la duration modificada nunca supera los años al vencimiento', () => {
    // Cota estructural: con cupones positivos la Macaulay siempre es menor al
    // plazo final, y la modificada todavía menor. Si esto falla, el flujo
    // cargado tiene fechas mal.
    for (const b of calcularMetricasProvinciales(PRECIOS, HOY)) {
      const años = b.diasAlVencimiento / 365;
      expect(b.modifiedDuration).toBeLessThan(años);
    }
  });

  it('cada TIR calculada reproduce la que publican Docta y argen.bond', () => {
    // La TNA de cupón está calibrada justamente para esto (ver `tnaCupon`),
    // así que el test no valida el modelo de forma independiente: detecta que
    // alguien toque el flujo, las fechas o el valor técnico y desalinee el
    // cálculo de la referencia de terceros.
    for (const b of calcularMetricasProvinciales(PRECIOS, HOY)) {
      const ref = TIR_REFERENCIA[b.ticker];
      expect(Math.abs(b.tir - ref)).toBeLessThan(0.005);
    }
  });

  it('la paridad calculada coincide con la publicada por Docta', () => {
    // Control independiente del anterior: paridad = precio / valor técnico.
    // Verificado contra Docta al 2026-08-06 (PR17 0,9058; PBA28 0,9811;
    // PBA27 0,9968). Si alguien cambia un valor técnico, esto lo detecta.
    const esperada: Record<string, number> = { PBA27: 0.9968, PBA28: 0.9811, PR17: 0.9058 };
    for (const b of calcularMetricasProvinciales(PRECIOS, HOY)) {
      expect(b.parity).not.toBeNull();
      expect(Math.abs((b.parity as number) - esperada[b.ticker])).toBeLessThan(0.002);
    }
  });

  it('omite el bono si no hay precio en vez de inventar una TIR', () => {
    const m = calcularMetricasProvinciales({ PBA27: 100.25 }, HOY);
    expect(m.map((b) => b.ticker)).toEqual(['PBA27']);
  });

  it('ignora precios inválidos', () => {
    expect(calcularMetricasProvinciales({ PBA27: 0, PBA28: -5 }, HOY)).toEqual([]);
  });

  it('PBA28 va al grupo CER y los de tasa variable a ARS_TASA', () => {
    const m = calcularMetricasProvinciales(PRECIOS, HOY);
    const porTicker = Object.fromEntries(m.map((b) => [b.ticker, b]));
    expect(porTicker.PBA28.grupo).toBe('CER');
    expect(porTicker.PBA27.grupo).toBe('ARS_TASA');
    expect(porTicker.PR17.grupo).toBe('ARS_TASA');
  });

  it('excluye los pagos ya vencidos del flujo', () => {
    // Parado casi al vencimiento de PBA27, la duration tiene que colapsar
    // contra cero: si los pagos viejos siguieran en el flujo, no lo haría.
    const casiVencido = new Date('2027-04-01T00:00:00Z');
    const m = calcularMetricasProvinciales({ PBA27: 100.25 }, casiVencido);
    expect(m[0].modifiedDuration).toBeLessThan(0.15);
  });
});
