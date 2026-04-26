export interface ResumenRow {
  fecha: string;       // "Mar-2024"
  fechaTs: number;     // timestamp ms
  aportes: number;
  acumulado: number;
  total_cartera: number;
  rendimiento: number;
}

export interface MovimientoRow {
  fecha: number;       // timestamp ms
  monto_usd: number;
  tipo: 'ingreso' | 'salida';
  monto_neto: number;  // positivo = ingreso, negativo = salida
}

export interface ActivoRow {
  TICKER: string;
  BROKER: string;
  TIPO: string;
  RIESGO: number;
  SECTOR_GEO: string;
  RENTA: string;
  MONEDA: string;
}

export interface TenenciaRow {
  ticker: string;
  tenencia_ars: number;
  tenencia_usd: number;
  fechaTs: number;  // timestamp ms
  fechaMes: string; // "YYYY-MM"
}

export interface TenenciaActual extends TenenciaRow {
  TIPO: string;
  RIESGO: number;
  SECTOR_GEO: string;
  RENTA: string;
  MONEDA: string;
}

export interface KPIData {
  totalCartera: number;
  aporteAcumulados: number;
  rendimientoNeto: number;
  rendimientoPct: number;
  deltaCartera: number;
  tirAnual: number | null;
  fechaStr: string;
}

export interface DashboardData {
  kpis: KPIData;
  resumenSeries: ResumenRow[];
  tenenciasPorMes: Record<string, TenenciaActual[]>;
  mesesDisponibles: string[];           // ["Mar-2024", ...] ordered
  totalPorMes: Record<string, number>;  // "YYYY-MM" → total_cartera
}
