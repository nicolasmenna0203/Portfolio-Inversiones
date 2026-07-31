import type { BondPerformance, GrupoBono, GrupoPonderado, PerformanceResponse, SensibilidadTir } from '@/types';
import { fetchBondMetrics } from './bondMetrics';

const GRUPOS: GrupoBono[] = ['USD', 'CER', 'ARS_TASA', 'DOLLAR_LINKED', 'BOPREAL'];
const SHOCKS = [1, 2, 3, 5, 10];

/**
 * Aproximación de primer orden de la sensibilidad de la TIR a un shock de
 * precio, vía duration modificada: ΔTIR ≈ Δprecio% / duration. Ignora
 * convexidad (error creciente en shocks grandes o duration muy corta), pero
 * es la fórmula estándar de renta fija y, a diferencia de los campos
 * tir_up/tir_down de bonistas.com, su cálculo es verificable.
 */
function calcularSensibilidad(tir: number, duration: number): SensibilidadTir[] {
  if (duration <= 0) return [];
  return SHOCKS.map((shock) => ({
    shock,
    tirDown: tir + (shock / 100) / duration,
    tirUp: tir - (shock / 100) / duration,
  }));
}

/**
 * Junta el universo de bonos mapeados (TIR, TNA, duration, paridad) con las
 * tenencias actuales de la cartera, y calcula TIR/duration ponderada por
 * grupo — nunca mezclando USD con ARS ni CER con tasa fija en pesos, porque
 * son tasas en monedas/índices distintos y promediarlas sería engañoso.
 */
export async function fetchPerformance(
  tenencias: Record<string, number> = {},
): Promise<PerformanceResponse> {
  const metricsMap = await fetchBondMetrics();

  const bonos: BondPerformance[] = [...metricsMap.values()]
    .map((m) => {
      const tenenciaUsd = tenencias[m.tickerCartera ?? m.ticker];
      return {
        ...m,
        sensibilidad: calcularSensibilidad(m.tir, m.modifiedDuration),
        ...(tenenciaUsd ? { tenenciaUsd } : {}),
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const carteraPorGrupo: GrupoPonderado[] = [];
  for (const grupo of GRUPOS) {
    const enCartera = bonos.filter((b) => b.grupo === grupo && b.tenenciaUsd);
    const tenenciaTotalUsd = enCartera.reduce((s, b) => s + (b.tenenciaUsd ?? 0), 0);
    if (tenenciaTotalUsd === 0) continue;

    const tirPonderada = enCartera.reduce((s, b) => s + b.tir * (b.tenenciaUsd ?? 0), 0) / tenenciaTotalUsd;
    const durationPonderada = enCartera.reduce((s, b) => s + b.modifiedDuration * (b.tenenciaUsd ?? 0), 0) / tenenciaTotalUsd;

    carteraPorGrupo.push({ grupo, tirPonderada, durationPonderada, tenenciaTotalUsd });
  }

  return { bonos, carteraPorGrupo, generatedAt: Date.now() };
}
