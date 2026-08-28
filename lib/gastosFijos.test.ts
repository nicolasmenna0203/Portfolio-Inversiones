import { describe, it, expect } from 'vitest';
import { normalizarGastos, montoMensual } from './gastosFijos';

describe('normalizarGastos', () => {
  it('conserva gastos válidos', () => {
    const r = normalizarGastos([
      { nombre: 'Claude', monto: 20, moneda: 'USD', frecuencia: 'mensual', categoria: 'Suscripciones' },
    ]);
    expect(r).toEqual([
      { nombre: 'Claude', monto: 20, moneda: 'USD', frecuencia: 'mensual', categoria: 'Suscripciones' },
    ]);
  });

  it('descarta entradas sin nombre', () => {
    const r = normalizarGastos([{ nombre: '', monto: 100, moneda: 'ARS', frecuencia: 'mensual', categoria: 'X' }]);
    expect(r).toEqual([]);
  });

  it.each([-1, 0, NaN, Infinity])('descarta monto inválido %s', (monto) => {
    const r = normalizarGastos([{ nombre: 'Algo', monto, moneda: 'ARS', frecuencia: 'mensual', categoria: 'X' }]);
    expect(r).toEqual([]);
  });

  it('convierte monto string a número', () => {
    const r = normalizarGastos([{ nombre: 'Seguro', monto: '45000', moneda: 'ARS', frecuencia: 'mensual', categoria: 'Seguros' }]);
    expect(r[0].monto).toBe(45000);
  });

  it('cae a ARS si la moneda no es USD', () => {
    const r = normalizarGastos([{ nombre: 'X', monto: 10, moneda: 'inventada', frecuencia: 'mensual', categoria: 'Y' }]);
    expect(r[0].moneda).toBe('ARS');
  });

  it('cae a mensual si la frecuencia es inválida', () => {
    const r = normalizarGastos([{ nombre: 'X', monto: 10, moneda: 'ARS', frecuencia: 'semanal', categoria: 'Y' }]);
    expect(r[0].frecuencia).toBe('mensual');
  });

  it('usa "Sin categoría" si no viene categoría', () => {
    const r = normalizarGastos([{ nombre: 'X', monto: 10, moneda: 'ARS', frecuencia: 'mensual', categoria: '' }]);
    expect(r[0].categoria).toBe('Sin categoría');
  });

  it('devuelve vacío si el input no es un array', () => {
    expect(normalizarGastos(null)).toEqual([]);
    expect(normalizarGastos({})).toEqual([]);
    expect(normalizarGastos('x')).toEqual([]);
  });
});

describe('montoMensual', () => {
  it('devuelve el monto tal cual si la frecuencia es mensual', () => {
    expect(montoMensual({ nombre: 'X', monto: 100, moneda: 'ARS', frecuencia: 'mensual', categoria: 'Y' })).toBe(100);
  });

  it('prorratea /12 si la frecuencia es anual', () => {
    expect(montoMensual({ nombre: 'X', monto: 1200, moneda: 'ARS', frecuencia: 'anual', categoria: 'Y' })).toBe(100);
  });
});
