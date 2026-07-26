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

export interface CalendarioResponse {
  eventos: EventoCalendario[];
  errores: string[];
  generatedAt: number;
}
