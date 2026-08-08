import { describe, it, expect } from 'vitest';
import { normalizar, esDimension, DIMENSIONES } from './objetivos';

describe('esDimension', () => {
  it('acepta las cinco dimensiones válidas', () => {
    for (const d of DIMENSIONES) expect(esDimension(d)).toBe(true);
  });

  it('rechaza cualquier otra cosa', () => {
    expect(esDimension('SECTOR')).toBe(false);
    expect(esDimension('tipo')).toBe(false); // se espera ya normalizado a mayúsculas
    expect(esDimension('')).toBe(false);
  });
});

describe('normalizar', () => {
  it('conserva las dimensiones y categorías válidas', () => {
    const r = normalizar({ TIPO: { ETF: 40, FCI: 60 } });
    expect(r.TIPO).toEqual({ ETF: 40, FCI: 60 });
  });

  it('acepta dimensiones en minúscula y las normaliza', () => {
    const r = normalizar({ tipo: { ETF: 25 } });
    expect(r.TIPO).toEqual({ ETF: 25 });
  });

  it('devuelve las cinco dimensiones aunque el input traiga una sola', () => {
    const r = normalizar({ TIPO: { ETF: 10 } });
    expect(Object.keys(r).sort()).toEqual([...DIMENSIONES].sort());
    expect(r.RIESGO).toEqual({});
  });

  it('descarta dimensiones desconocidas', () => {
    const r = normalizar({ INVENTADA: { X: 50 }, TIPO: { ETF: 50 } });
    expect(r).not.toHaveProperty('INVENTADA');
    expect(r.TIPO).toEqual({ ETF: 50 });
  });

  // El rango importa: un porcentaje fuera de 0-100 llegaría al Sheet y de ahí
  // al cálculo de desvío del asesor.
  it.each([-1, 101, NaN, Infinity])('descarta el porcentaje inválido %s', (val) => {
    const r = normalizar({ TIPO: { ETF: val, FCI: 30 } });
    expect(r.TIPO).toEqual({ FCI: 30 });
  });

  it('convierte strings numéricos', () => {
    const r = normalizar({ TIPO: { ETF: '40' } });
    expect(r.TIPO).toEqual({ ETF: 40 });
  });

  it('descarta valores no numéricos', () => {
    const r = normalizar({ TIPO: { ETF: 'mucho', FCI: 20 } });
    expect(r.TIPO).toEqual({ FCI: 20 });
  });

  it('acepta 0 y 100 como extremos válidos', () => {
    const r = normalizar({ TIPO: { A: 0, B: 100 } });
    expect(r.TIPO).toEqual({ A: 0, B: 100 });
  });

  it('recorta espacios del nombre de categoría y descarta las vacías', () => {
    const r = normalizar({ TIPO: { '  ETF  ': 40, '   ': 10 } });
    expect(r.TIPO).toEqual({ ETF: 40 });
  });

  it.each([null, undefined, 'texto', 42, []])('tolera el input inválido %s', (input) => {
    const r = normalizar(input);
    expect(Object.keys(r).sort()).toEqual([...DIMENSIONES].sort());
    expect(r.TIPO).toEqual({});
  });

  it('ignora una dimensión cuyo valor no es un objeto', () => {
    const r = normalizar({ TIPO: 'no es un objeto', RIESGO: { Alto: 30 } });
    expect(r.TIPO).toEqual({});
    expect(r.RIESGO).toEqual({ Alto: 30 });
  });

  // No se valida que sumen 100: la UI permite guardar un set incompleto
  // mientras se está ajustando, y forzarlo perdería el trabajo en curso.
  it('no exige que los porcentajes sumen 100', () => {
    const r = normalizar({ TIPO: { ETF: 10, FCI: 20 } });
    expect(r.TIPO).toEqual({ ETF: 10, FCI: 20 });
  });
});
