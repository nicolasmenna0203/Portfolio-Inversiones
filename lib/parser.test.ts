import { describe, it, expect } from 'vitest';
import { parseArgNum, parseFechaDia, parseFechaMes, toMesKey, valorSegunMoneda } from './parser';

describe('parseArgNum', () => {
  it('pasa un number directamente', () => {
    expect(parseArgNum(1234.5)).toBe(1234.5);
  });

  it('parsea formato argentino con miles y decimales: "1.234,56"', () => {
    expect(parseArgNum('1.234,56')).toBe(1234.56);
  });

  it('parsea miles sin decimales: "50.000"', () => {
    expect(parseArgNum('50.000')).toBe(50000);
  });

  it('parsea decimales sin miles: "12,5"', () => {
    expect(parseArgNum('12,5')).toBe(12.5);
  });

  it('no confunde "1.234" (miles) con "1.2" (decimal con punto)', () => {
    // Regla actual: solo se interpreta como miles si son grupos de 3 dígitos.
    expect(parseArgNum('1.2')).toBe(1.2);
  });

  it('devuelve null para vacío, guion o no numérico', () => {
    expect(parseArgNum('')).toBeNull();
    expect(parseArgNum('-')).toBeNull();
    expect(parseArgNum(null)).toBeNull();
    expect(parseArgNum(undefined)).toBeNull();
    expect(parseArgNum('abc')).toBeNull();
  });

  it('ignora espacios y NBSP', () => {
    expect(parseArgNum('1.234,56 ')).toBe(1234.56);
    expect(parseArgNum(' 500 ')).toBe(500);
  });
});

describe('parseFechaDia', () => {
  it('parsea ISO "YYYY-MM-DD"', () => {
    expect(parseFechaDia('2024-07-31')).toBe(Date.UTC(2024, 6, 31));
  });

  it('parsea formato argentino "DD/MM/YYYY"', () => {
    expect(parseFechaDia('31/07/2024')).toBe(Date.UTC(2024, 6, 31));
  });

  it('parsea año de 2 dígitos "DD/MM/YY" asumiendo 2000+', () => {
    expect(parseFechaDia('31/07/24')).toBe(Date.UTC(2024, 6, 31));
  });

  it('devuelve null para vacío o formato desconocido', () => {
    expect(parseFechaDia('')).toBeNull();
    expect(parseFechaDia('31 julio 2024')).toBeNull();
  });
});

describe('parseFechaMes', () => {
  it('parsea "mar-24" con año de 2 dígitos', () => {
    expect(parseFechaMes('mar-24')).toBe(Date.UTC(2024, 2, 1));
  });

  it('parsea "mar-2024" con año completo', () => {
    expect(parseFechaMes('mar-2024')).toBe(Date.UTC(2024, 2, 1));
  });

  it('es case-insensitive', () => {
    expect(parseFechaMes('MAR-24')).toBe(Date.UTC(2024, 2, 1));
  });

  it('devuelve null para mes no reconocido', () => {
    expect(parseFechaMes('xyz-24')).toBeNull();
  });
});

describe('toMesKey', () => {
  it('formatea "YYYY-MM" con mes con padding', () => {
    expect(toMesKey(Date.UTC(2024, 0, 15))).toBe('2024-01');
    expect(toMesKey(Date.UTC(2024, 10, 1))).toBe('2024-11');
  });
});

describe('valorSegunMoneda', () => {
  it('elige USD o ARS según el parámetro', () => {
    expect(valorSegunMoneda(100, 150000, 'USD')).toBe(100);
    expect(valorSegunMoneda(100, 150000, 'ARS')).toBe(150000);
  });
});
