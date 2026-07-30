export interface ResumenRow {
  fecha: string;       // "Mar-2024"
  fechaTs: number;     // timestamp ms
  aportes: number;
  acumulado: number;
  total_cartera: number;
  total_cartera_ars: number;
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
  totalCarteraArs: number;
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
  mesesDisponibles: string[];              // ["Mar-2024", ...] ordered
  totalPorMes: Record<string, number>;     // "YYYY-MM" → total_cartera (USD)
  totalPorMesArs: Record<string, number>;  // "YYYY-MM" → total_cartera_ars
}

// ── Benchmarks ────────────────────────────────────────────────────────────────

export type BenchmarkId = 'sp500' | 'inflacion' | 'mep' | 'btc' | 'oro';

export interface BenchmarkPoint {
  mesKey: string;   // "YYYY-MM"
  fecha: string;    // "Mar-2025"
  valor: number;    // índice base 100
}

export interface BenchmarkSeries {
  id: BenchmarkId;
  label: string;
  puntos: BenchmarkPoint[];
  error?: string;   // presente si esta fuente puntual falló
}

export interface BenchmarksResponse {
  baseMesKey: string;
  series: BenchmarkSeries[];
  generatedAt: number;
}

// ── FX (dólar MEP absoluto) ─────────────────────────────────────────────────

export interface FxResponse {
  puntos: { mesKey: string; valorArs: number }[];
  generatedAt: number;
  error?: string;
}

// ── Calendario: Noticias ─────────────────────────────────────────────────────

export interface NoticiaItem {
  titulo: string;
  link: string;
  fuente: string;      // "Yahoo Finance" | "Ámbito"
  fecha: number;        // timestamp ms
  ticker?: string;       // ausente en noticias generales (Ámbito)
}

export interface NoticiasResponse {
  noticias: NoticiaItem[];
  errores: string[];
  generatedAt: number;
}

// ── Calendario: Eventos (earnings/dividendos) ────────────────────────────────

export type EventoTipo =
  | 'dividendo'        // dividendo ya pagado (histórico Yahoo)
  | 'dividendo-fut'    // dividendo futuro confirmado (Nasdaq)
  | 'earnings'         // balance / reporte de resultados (Yahoo)
  | 'renta'            // cupón de interés de bono/ON ARG (bonistas)
  | 'amortizacion';    // devolución de capital de bono/ON ARG (bonistas)

export interface EventoCalendario {
  ticker: string;
  tipo: EventoTipo;
  fecha: string;        // "YYYY-MM-DD"
  detalle?: string;      // ej. "EPS est. 1.52" o "0.24 USD/acción"
  montoEstimado?: number; // cobro estimado según tenencia actual (USD)
  monedaMonto?: string;   // moneda del montoEstimado (ej. "USD", "ARS")
}

/** Dividend yield trailing 12 meses de una posición, para mostrar como dato. */
export interface YieldTicker {
  ticker: string;
  /** Yield bruto que publica el emisor, sin retenciones (0.0701 = 7.01%).
   *  Deliberadamente inconsistente con `cobroAnual`, que sí va neto: el yield
   *  se muestra como en cualquier screener para poder compararlo. */
  yieldAnual: number;
  pagos: number;        // cantidad de pagos en 12m
  cobroAnual?: number;  // neto estimado a cobrar al año según tenencia (USD)
}

export interface CalendarioResponse {
  eventos: EventoCalendario[];
  yields: YieldTicker[];
  errores: string[];
  generatedAt: number;
}

// ── Performance (renta fija): TIR, duration, paridad ─────────────────────────

export interface SensibilidadTir {
  shock: number;    // % de shock de precio (1, 2, 3, 5, 10)
  tirDown: number;   // TIR aproximada si el precio cae `shock`%: TIR + shock%/duration
  tirUp: number;      // TIR aproximada si el precio sube `shock`%: TIR - shock%/duration
}

/** Agrupamiento por tipo de tasa — TIRs de distinto grupo no son comparables entre sí. */
export type GrupoBono = 'USD' | 'CER' | 'ARS_TASA' | 'DOLLAR_LINKED';

export interface BondPerformance {
  ticker: string;
  bondFamily: string;
  moneda: string;              // moneda en la que se calculó la TIR (USD o ARS)
  grupo: GrupoBono;             // USD hard-dollar / CER (ajustado inflación) / ARS tasa / dollar-linked
  tir: number;                  // TIR efectiva anual, en tanto por uno
  tna: number;                  // tasa nominal anual, en tanto por uno
  modifiedDuration: number;     // años
  parity: number | null;
  fairValue: number | null;
  lastPrice: number | null;
  sensibilidad: SensibilidadTir[];
  /** Presente solo si el ticker está en la cartera actual. */
  tenenciaUsd?: number;
}

/** TIR y duration ponderadas por tenencia, calculadas solo dentro del mismo grupo. */
export interface GrupoPonderado {
  grupo: GrupoBono;
  tirPonderada: number;
  durationPonderada: number;
  tenenciaTotalUsd: number;
}

export interface PerformanceResponse {
  bonos: BondPerformance[];
  /** Una entrada por grupo con posiciones en cartera; ausente si no hay tenencia en ese grupo. */
  carteraPorGrupo: GrupoPonderado[];
  generatedAt: number;
}
