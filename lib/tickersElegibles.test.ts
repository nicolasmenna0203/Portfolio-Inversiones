import { describe, it, expect } from 'vitest';
import { tickersDeCartera, aliasYahoo } from './tickersElegibles';
import type { TenenciaActual } from '@/types';

function item(partial: Partial<TenenciaActual> & { ticker: string }): TenenciaActual {
  return {
    tenencia_ars: 0,
    tenencia_usd: 0,
    fechaTs: 0,
    fechaMes: '2026-07',
    TIPO: 'ACCION',
    RIESGO: 1,
    SECTOR_GEO: 'USA',
    RENTA: 'Variable',
    MONEDA: 'USD',
    ...partial,
  };
}

describe('tickersDeCartera', () => {
  it('incluye acciones/ETFs que no son ARG', () => {
    const { tickersUsa } = tickersDeCartera([item({ ticker: 'AAPL', TIPO: 'ACCION' })]);
    expect(tickersUsa).toEqual(['AAPL']);
  });

  it('excluye activos ARG aunque el tipo sea válido', () => {
    const { tickersUsa } = tickersDeCartera([item({ ticker: 'GGAL', TIPO: 'ACCION', SECTOR_GEO: 'ARG' })]);
    expect(tickersUsa).toEqual([]);
  });

  it('excluye FCIs y otros tipos no cotizables', () => {
    const { tickersUsa } = tickersDeCartera([item({ ticker: 'COCOMAY', TIPO: 'FCI' })]);
    expect(tickersUsa).toEqual([]);
  });

  it('respeta la excepción de inclusión (GLD, BTC) aunque el TIPO no sea válido', () => {
    const { tickersUsa } = tickersDeCartera([item({ ticker: 'GLD', TIPO: 'ALTS' })]);
    expect(tickersUsa).toEqual(['GLD']);
  });

  it('respeta la excepción de exclusión (COCOACCA) aunque el TIPO sea válido', () => {
    const { tickersUsa } = tickersDeCartera([item({ ticker: 'COCOACCA', TIPO: 'ETF' })]);
    expect(tickersUsa).toEqual([]);
  });

  it('detecta bonos ARG mapeados para tickersArg', () => {
    const { tickersArg } = tickersDeCartera([item({ ticker: 'GD30', TIPO: 'BONO', SECTOR_GEO: 'ARG' })]);
    expect(tickersArg).toEqual(['GD30']);
  });

  it('no incluye en tickersArg un bono sin mapeo', () => {
    const { tickersArg } = tickersDeCartera([item({ ticker: 'NOEXISTE99', TIPO: 'BONO', SECTOR_GEO: 'ARG' })]);
    expect(tickersArg).toEqual([]);
  });

  it('solo incluye tenencia_usd positiva en el mapa de tenencias', () => {
    const { tenencias } = tickersDeCartera([
      item({ ticker: 'AAPL', tenencia_usd: 500 }),
      item({ ticker: 'MSFT', tenencia_usd: 0 }),
    ]);
    expect(tenencias).toEqual({ AAPL: 500 });
  });

  it('normaliza tickers a mayúsculas', () => {
    const { tickersUsa, tenencias } = tickersDeCartera([item({ ticker: 'aapl', tenencia_usd: 10 })]);
    expect(tickersUsa).toEqual(['AAPL']);
    expect(tenencias).toEqual({ AAPL: 10 });
  });
});

describe('aliasYahoo', () => {
  it('traduce la forma sin separador al símbolo real de Yahoo', () => {
    expect(aliasYahoo('BRKB')).toBe('BRK-B');
    expect(aliasYahoo('brkb')).toBe('BRK-B');
  });

  it('deja sin cambios un ticker sin alias', () => {
    expect(aliasYahoo('AAPL')).toBe('AAPL');
  });
});
