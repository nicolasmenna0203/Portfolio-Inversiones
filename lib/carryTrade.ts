import type { BondPerformance, CarryTradeItem } from '@/types';

/**
 * Carry trade: vender USD al MEP de entrada, comprar el instrumento en pesos,
 * mantenerlo hasta el vencimiento y volver a comprar USD al MEP de salida.
 * Calculado client-side (no vía API) porque el MEP de entrada/salida es un
 * escenario que el usuario ajusta de forma interactiva — recalcular en el
 * cliente evita un roundtrip por cada cambio de input.
 *
 * Universo: todo BondPerformance con grupo ARS_TASA (LECAP, Boncap, duales,
 * Tamar, Badlar) — mismo criterio que ya usa la curva de rendimientos.
 */
export function calcularCarryTrade(
  bonos: BondPerformance[],
  mepEntrada: number | null,
  mepSalida: number | null,
): CarryTradeItem[] {
  return bonos
    .filter((b) => b.grupo === 'ARS_TASA')
    .map((b) => {
      const anios = b.diasAlVencimiento / 365;
      const retornoDirectoArs = Math.pow(1 + b.tir, anios) - 1;
      const mepBreakeven = mepEntrada != null ? mepEntrada * (1 + retornoDirectoArs) : NaN;
      const devaluacionBreakeven = mepEntrada != null ? mepBreakeven / mepEntrada - 1 : NaN;
      const retornoDirectoUsd =
        mepEntrada != null && mepSalida != null
          ? ((1 + retornoDirectoArs) * mepEntrada) / mepSalida - 1
          : null;

      return {
        ticker: b.ticker,
        bondFamily: b.bondFamily,
        tir: b.tir,
        tna: b.tna,
        vencimiento: b.vencimiento,
        diasAlVencimiento: b.diasAlVencimiento,
        retornoDirectoArs,
        mepBreakeven,
        devaluacionBreakeven,
        retornoDirectoUsd,
        ...(b.tenenciaUsd ? { tenenciaUsd: b.tenenciaUsd } : {}),
      };
    })
    .sort((a, b) => a.diasAlVencimiento - b.diasAlVencimiento);
}
