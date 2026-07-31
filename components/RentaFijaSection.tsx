'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ComposedChart, Scatter, Line, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer,
} from 'recharts';
import type { GrupoBono, BondPerformance } from '@/types';
import { usePerformance } from '@/lib/usePerformance';
import KPICard from './KPICard';

interface Props {
  tenencias: Record<string, number>;
}

// Paleta categórica validada (skill dataviz, slots 1-2-3: blue/orange/aqua) contra
// las superficies reales del tema Prestige (--card claro #ffffff, oscuro #2c2620).
// TIRs de distinto grupo no son comparables entre sí (moneda/índice distinto),
// así que cada uno tiene su propio color en vez de un gradiente continuo.
const GRUPO_META: Record<GrupoBono, { label: string; color: string; colorDark: string }> = {
  USD:            { label: 'USD (hard-dollar)', color: '#2a78d6', colorDark: '#3987e5' },
  CER:            { label: 'CER (ajustado inflación)', color: '#eb6834', colorDark: '#d95926' },
  ARS_TASA:       { label: 'LECAP / Dual / Tamar / Badlar', color: '#1baf7a', colorDark: '#199e70' },
  DOLLAR_LINKED:  { label: 'Dollar-linked', color: '#4a3aa7', colorDark: '#9085e9' },
};
const GRUPO_ORDEN: GrupoBono[] = ['USD', 'CER', 'ARS_TASA', 'DOLLAR_LINKED'];

function fmtPct1(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDuration(v: number): string {
  return `${v.toFixed(2)} a.`;
}

// Radio del punto: en cartera se resalta con un radio mayor (encoding secundario
// a la posición en el eje, no solo color) para que se distinga sin depender del ojo.
function radioDe(b: BondPerformance): number {
  return b.tenenciaUsd ? 7 : 4;
}

interface ScatterShapeProps {
  cx?: number;
  cy?: number;
  fill?: string;
  payload?: BondPerformance;
}

// Ancho aproximado del label en px por caracter a fontSize 11 (Public Sans,
// bold) — no hay forma de medir texto real en un shape SVG sin acceso al
// DOM, así que se estima para centrar el fondo del label sin dejarlo
// desalineado del texto.
const ANCHO_POR_CARACTER = 6.2;

/**
 * Fábrica del shape del Scatter: <Scatter> de Recharts no tipa props propias
 * en su `shape` (solo pasa cx/cy/fill/payload), así que `hoverTicker`/
 * `onHover` no pueden viajar como props del <Scatter> sin romper los tipos
 * de la librería. Se capturan por closure en su lugar — se recrea el shape
 * en cada render de RentaFijaSection, que es aceptable porque el volumen de
 * puntos es chico (decenas, no miles).
 */
function crearScatterPoint(hoverTicker: string | null, onHover: (b: BondPerformance | null) => void) {
  return function ScatterPoint(props: unknown) {
    const { cx, cy, fill, payload } = props as ScatterShapeProps;
    if (cx == null || cy == null || !payload) return <g />;
    const activo = hoverTicker === payload.ticker;
    const r = radioDe(payload);
    return (
      <g
        onMouseEnter={() => onHover(payload)}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: 'pointer' }}
      >
        {/* Círculo invisible con radio ampliado: solo agranda el área de
            hover para que el label dispare sin tener que apuntar al punto
            visible de 4-7px. El label en sí lo maneja `hoverTicker` (estado
            manual en RentaFijaSection) en vez del <Tooltip> de Recharts, que
            en un ComposedChart con Scatter detecta por cercanía de
            posición-X, no proximidad real 2D al punto — con varios bonos en
            el mismo rango de duration pero distinta TIR, eso hacía casi
            imposible acertarle al punto correcto. */}
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
        <circle
          cx={cx} cy={cy} r={r}
          fill={fill} fillOpacity={payload.tenenciaUsd ? 1 : 0.45}
          stroke={payload.tenenciaUsd ? fill : 'none'}
          strokeWidth={payload.tenenciaUsd ? 2 : 0}
          strokeOpacity={0.4}
        />
        {activo && (
          <g style={{ pointerEvents: 'none' }}>
            <rect
              x={cx - (payload.ticker.length * ANCHO_POR_CARACTER) / 2 - 6}
              y={cy - r - 22}
              width={payload.ticker.length * ANCHO_POR_CARACTER + 12}
              height={18}
              rx={5}
              fill="var(--card)"
              stroke="var(--border)"
            />
            <text
              x={cx} y={cy - r - 10}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="var(--text)"
            >
              {payload.ticker}
            </text>
          </g>
        )}
      </g>
    );
  };
}

/** Resuelve un sistema lineal Ax=b de 3x3 por eliminación gaussiana con pivoteo parcial. */
function resolver3x3(A: number[][], b: number[]): number[] | null {
  const M = A.map((fila, i) => [...fila, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivote = col;
    for (let f = col + 1; f < 3; f++) if (Math.abs(M[f][col]) > Math.abs(M[pivote][col])) pivote = f;
    if (Math.abs(M[pivote][col]) < 1e-12) return null;
    [M[col], M[pivote]] = [M[pivote], M[col]];
    for (let f = 0; f < 3; f++) {
      if (f === col) continue;
      const factor = M[f][col] / M[col][col];
      for (let c = col; c <= 3; c++) M[f][c] -= factor * M[col][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/**
 * Regresión cuadrática (mínimos cuadrados, TIR = a·duration² + b·duration + c)
 * para trazar la forma real de la curva de rendimientos — las curvas de bonos
 * suelen ser cóncavas/convexas, no rectas. Con pocos puntos (<6) una parábola
 * sobreajusta y puede generar formas sin sentido económico, así que se cae a
 * una recta (mínimos cuadrados grado 1) en ese caso.
 */
function regresionCurva(puntos: { x: number; y: number }[]): ((x: number) => number) | null {
  const n = puntos.length;
  if (n < 2) return null;

  if (n >= 6) {
    let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (const { x, y } of puntos) {
      const x2 = x * x;
      s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
      t0 += y; t1 += x * y; t2 += x2 * y;
    }
    const sol = resolver3x3(
      [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]],
      [t0, t1, t2],
    );
    if (sol) {
      const [c, b, a] = sol;
      return (x: number) => a * x * x + b * x + c;
    }
    // Sistema mal condicionado (ej. durations casi idénticas): cae a lineal.
  }

  const sumX = puntos.reduce((s, p) => s + p.x, 0);
  const sumY = puntos.reduce((s, p) => s + p.y, 0);
  const sumXY = puntos.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = puntos.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null; // todas las duration iguales: sin pendiente definible
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return (x: number) => intercept + slope * x;
}

interface TendenciaPunto {
  modifiedDuration: number;
  tirTendencia: number;
}

type SortKey = 'ticker' | 'tir' | 'modifiedDuration' | 'parity';

export default function RentaFijaSection({ tenencias }: Props) {
  const { data: perf, loading, error } = usePerformance(tenencias);
  const [hoverBono, setHoverBono] = useState<BondPerformance | null>(null);

  // Siempre hay exactamente un grupo activo — nunca los 4 juntos, porque sus
  // TIR no son comparables entre sí (monedas/índices distintos). Al cargar,
  // se preselecciona el primer grupo con posición en cartera (una sola vez).
  const [filtroGrupo, setFiltroGrupo] = useState<GrupoBono>('USD');
  const preseleccionado = useRef(false);

  useEffect(() => {
    if (preseleccionado.current || !perf) return;
    preseleccionado.current = true;
    const primerConPosicion = GRUPO_ORDEN.find((g) => perf.carteraPorGrupo.some((c) => c.grupo === g));
    if (primerConPosicion) setFiltroGrupo(primerConPosicion);
  }, [perf]);

  const [sortKey, setSortKey] = useState<SortKey>('tir');
  const [sortDesc, setSortDesc] = useState(true);

  const bonos = perf?.bonos ?? [];

  const bonosDelGrupo = useMemo(
    () => bonos.filter((b) => b.grupo === filtroGrupo),
    [bonos, filtroGrupo],
  );

  // Rango de duration disponible en el grupo activo, para acotar el eje X del
  // scatter y la tabla. null mientras no hay bonos todavía (carga en curso),
  // para no confundir "sin datos" con un rango real [0,1] — bonosDelGrupo
  // llega vacío en el primer render (antes de que perf resuelva) y de nuevo
  // brevemente al cambiar de grupo, así que el efecto de abajo debe esperar a
  // que haya datos reales antes de fijar el rango, o queda pegado al [0,1]
  // placeholder para siempre.
  const rangoDisponible = useMemo<[number, number] | null>(() => {
    if (bonosDelGrupo.length === 0) return null;
    const durations = bonosDelGrupo.map((b) => b.modifiedDuration);
    return [Math.min(...durations), Math.max(...durations)];
  }, [bonosDelGrupo]);

  const [rangoDuration, setRangoDuration] = useState<[number, number]>([0, 1]);
  const rangoInicializado = useRef<GrupoBono | null>(null);

  useEffect(() => {
    if (!rangoDisponible) return; // esperar a que el grupo tenga datos reales
    if (rangoInicializado.current === filtroGrupo) return;
    rangoInicializado.current = filtroGrupo;
    setRangoDuration(rangoDisponible);
  }, [filtroGrupo, rangoDisponible]);

  const rangoActivo: [number, number] = rangoDisponible ?? [0, 1];

  const bonosFiltrados = useMemo(
    () => bonosDelGrupo.filter((b) => b.modifiedDuration >= rangoDuration[0] && b.modifiedDuration <= rangoDuration[1]),
    [bonosDelGrupo, rangoDuration],
  );

  // Línea de tendencia (regresión cuadrática TIR ~ duration, con fallback
  // lineal si hay pocos puntos) sobre los bonos dentro del rango de duration
  // seleccionado — muestra la forma real de la curva de rendimientos, no solo
  // los puntos dispersos. Se generan 24 puntos intermedios para que la
  // parábola se vea como curva suave y no como segmentos rectos.
  const tendencia = useMemo<TendenciaPunto[]>(() => {
    const puntos = bonosFiltrados.map((b) => ({ x: b.modifiedDuration, y: b.tir }));
    const f = regresionCurva(puntos);
    if (!f) return [];
    const durations = puntos.map((p) => p.x);
    const minD = Math.min(...durations);
    const maxD = Math.max(...durations);
    if (minD === maxD) return [];
    const pasos = 24;
    return Array.from({ length: pasos + 1 }, (_, i) => {
      const d = minD + ((maxD - minD) * i) / pasos;
      return { modifiedDuration: d, tirTendencia: f(d) };
    });
  }, [bonosFiltrados]);

  const bonosOrdenados = useMemo(() => {
    const copia = [...bonosFiltrados];
    copia.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'ticker') cmp = a.ticker.localeCompare(b.ticker);
      else if (sortKey === 'parity') cmp = (a.parity ?? -Infinity) - (b.parity ?? -Infinity);
      else cmp = a[sortKey] - b[sortKey];
      return sortDesc ? -cmp : cmp;
    });
    return copia;
  }, [bonosFiltrados, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  const cabecera = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      style={{
        cursor: 'pointer', textAlign: 'right', padding: '8px 10px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: sortKey === key ? 'var(--primary)' : 'var(--muted)', whiteSpace: 'nowrap',
      }}
    >
      {label}{sortKey === key ? (sortDesc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Cargando métricas de bonos…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'var(--card)', border: '1px solid #ef553b', borderRadius: 10,
        padding: '10px 14px', fontSize: 12, color: '#ef553b',
      }}>
        Error cargando performance: {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── KPIs por grupo — nunca mezclados, cada tasa vive en su propia moneda/índice ── */}
      <div className="kpi-grid">
        {GRUPO_ORDEN.map((g) => {
          const kpi = perf?.carteraPorGrupo.find((c) => c.grupo === g);
          const meta = GRUPO_META[g];
          return (
            <KPICard
              key={g}
              label={`TIR cartera · ${meta.label}`}
              value={kpi ? fmtPct1(kpi.tirPonderada) : 'Sin posición'}
              sub={kpi ? `Duration ponderada: ${fmtDuration(kpi.durationPonderada)}` : undefined}
              subColor={meta.color}
              accentColor={meta.color}
            />
          );
        })}
      </div>

      {/* ── Selector de grupo — siempre uno activo, nunca los 4 juntos:       */}
      {/*    sus TIR no son comparables entre sí (monedas/índices distintos). */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        {GRUPO_ORDEN.map((g) => {
          const meta = GRUPO_META[g];
          const activo = filtroGrupo === g;
          return (
            <button
              key={g}
              onClick={() => setFiltroGrupo(g)}
              className="pill-touch"
              aria-pressed={activo}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', border: '1px solid',
                borderColor: activo ? meta.color : 'var(--border)',
                background: activo ? `${meta.color}22` : 'transparent',
                color: activo ? meta.color : 'var(--muted)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* ── Curva TIR vs Duration ─────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '14px 16px 8px', minHeight: 320, display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ marginBottom: 10, flexShrink: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-sec)', margin: 0 }}>
            Curva de Rendimientos (TIR vs Duration) · {GRUPO_META[filtroGrupo].label}
          </p>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            Un punto por bono · puntos grandes = posición en tu cartera · línea = tendencia del grupo (ajuste cuadrático) · acotado al rango de duration seleccionado
          </span>
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
              <XAxis
                type="number" dataKey="modifiedDuration" name="Duration"
                domain={[0, rangoDuration[1]]} allowDataOverflow
                tickFormatter={(v) => v.toFixed(2)}
                unit=" a." tick={{ fill: 'var(--muted)', fontSize: 11 }}
                tickLine={false} axisLine={false}
                label={{ value: 'Duration (años)', position: 'insideBottom', offset: -2, fill: 'var(--muted)', fontSize: 11 }}
              />
              <YAxis
                type="number" dataKey="tir" name="TIR"
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                tickLine={false} axisLine={false} width={44}
              />
              {tendencia.length > 0 && (
                <Line
                  type="monotone"
                  data={tendencia}
                  dataKey="tirTendencia"
                  xAxisId={0}
                  stroke={GRUPO_META[filtroGrupo].color}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  strokeOpacity={0.6}
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  isAnimationActive={false}
                  name="Tendencia"
                />
              )}
              <Scatter
                name={GRUPO_META[filtroGrupo].label}
                data={bonosFiltrados}
                fill={GRUPO_META[filtroGrupo].color}
                shape={crearScatterPoint(hoverBono?.ticker ?? null, setHoverBono)}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ── Selector de rango de duration — acota el scatter y la tabla ──── */}
        <div style={{ padding: '10px 4px 4px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Rango de duration
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-sec)', fontWeight: 600 }}>
              {fmtDuration(rangoDuration[0])} – {fmtDuration(rangoDuration[1])}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              aria-label="Duration mínima"
              min={rangoActivo[0]} max={rangoActivo[1]}
              step={(rangoActivo[1] - rangoActivo[0]) / 100 || 0.01}
              value={rangoDuration[0]}
              onChange={(e) => {
                const v = Math.min(Number(e.target.value), rangoDuration[1]);
                setRangoDuration([v, rangoDuration[1]]);
              }}
              style={{ flex: 1, accentColor: GRUPO_META[filtroGrupo].color }}
            />
            <input
              type="range"
              aria-label="Duration máxima"
              min={rangoActivo[0]} max={rangoActivo[1]}
              step={(rangoActivo[1] - rangoActivo[0]) / 100 || 0.01}
              value={rangoDuration[1]}
              onChange={(e) => {
                const v = Math.max(Number(e.target.value), rangoDuration[0]);
                setRangoDuration([rangoDuration[0], v]);
              }}
              style={{ flex: 1, accentColor: GRUPO_META[filtroGrupo].color }}
            />
            {(rangoDuration[0] !== rangoActivo[0] || rangoDuration[1] !== rangoActivo[1]) && (
              <button
                onClick={() => setRangoDuration(rangoActivo)}
                className="pill-touch"
                style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--muted)', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabla de métricas por bono ────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        overflow: 'auto', maxHeight: 420,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th onClick={() => toggleSort('ticker')} style={{ cursor: 'pointer', textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sortKey === 'ticker' ? 'var(--primary)' : 'var(--muted)' }}>
                Ticker{sortKey === 'ticker' ? (sortDesc ? ' ▼' : ' ▲') : ''}
              </th>
              {cabecera('tir', 'TIR')}
              <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>TNA</th>
              {cabecera('modifiedDuration', 'Duration')}
              {cabecera('parity', 'Paridad')}
              <th
                title="Aproximación de primer orden vía duration modificada: TIR ± 5%/duration. No incluye convexidad."
                style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', cursor: 'help' }}
              >TIR si precio -5% / +5%</th>
            </tr>
          </thead>
          <tbody>
            {bonosOrdenados.map((b) => {
              const meta = GRUPO_META[b.grupo];
              const sens5 = b.sensibilidad.find((s) => s.shock === 5);
              return (
                <tr
                  key={b.ticker}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: b.tenenciaUsd ? `${meta.color}11` : 'transparent',
                  }}
                >
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--text)' }}>
                    {b.ticker}{b.tenenciaUsd ? ' ★' : ''}
                    {b.etiqueta && (
                      <span style={{ marginLeft: 6, fontWeight: 600, fontSize: 10, color: 'var(--muted)' }}>
                        {b.etiqueta}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmtPct1(b.tir)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-sec)' }}>{fmtPct1(b.tna)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-sec)' }}>{fmtDuration(b.modifiedDuration)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-sec)' }}>{b.parity != null ? fmtPct1(b.parity) : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {sens5?.tirDown != null ? fmtPct1(sens5.tirDown) : '—'} / {sens5?.tirUp != null ? fmtPct1(sens5.tirUp) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
