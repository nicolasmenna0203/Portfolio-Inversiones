'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
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

interface TooltipPayload {
  payload: BondPerformance;
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  const meta = GRUPO_META[b.grupo];
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--text)' }}>{b.ticker}</p>
      <p style={{ margin: '0 0 6px', color: meta.color, fontSize: 11 }}>{meta.label}</p>
      <p style={{ margin: '2px 0', color: 'var(--text-sec)' }}>TIR: <strong>{fmtPct1(b.tir)}</strong></p>
      <p style={{ margin: '2px 0', color: 'var(--text-sec)' }}>Duration: <strong>{fmtDuration(b.modifiedDuration)}</strong></p>
      {b.parity != null && <p style={{ margin: '2px 0', color: 'var(--text-sec)' }}>Paridad: <strong>{fmtPct1(b.parity)}</strong></p>}
      {b.tenenciaUsd != null && <p style={{ margin: '6px 0 0', color: 'var(--primary)', fontSize: 11 }}>En cartera</p>}
    </div>
  );
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

function ScatterPoint(props: unknown) {
  const { cx, cy, fill, payload } = props as ScatterShapeProps;
  if (cx == null || cy == null || !payload) return <g />;
  return (
    <circle
      cx={cx} cy={cy} r={radioDe(payload)}
      fill={fill} fillOpacity={payload.tenenciaUsd ? 1 : 0.45}
      stroke={payload.tenenciaUsd ? fill : 'none'}
      strokeWidth={payload.tenenciaUsd ? 2 : 0}
      strokeOpacity={0.4}
    />
  );
}

type SortKey = 'ticker' | 'tir' | 'modifiedDuration' | 'parity';

export default function RentaFijaSection({ tenencias }: Props) {
  const { data: perf, loading, error } = usePerformance(tenencias);

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

  const bonosFiltrados = useMemo(
    () => bonos.filter((b) => b.grupo === filtroGrupo),
    [bonos, filtroGrupo],
  );

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
            Un punto por bono · puntos grandes = posición en tu cartera · universo del grupo seleccionado
          </span>
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
              <XAxis
                type="number" dataKey="modifiedDuration" name="Duration"
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
              <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--border)' }} />
              <Scatter
                name={GRUPO_META[filtroGrupo].label}
                data={bonosFiltrados}
                fill={GRUPO_META[filtroGrupo].color}
                shape={ScatterPoint}
              />
            </ScatterChart>
          </ResponsiveContainer>
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
