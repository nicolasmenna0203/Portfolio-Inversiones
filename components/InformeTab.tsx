'use client';

import { useMemo } from 'react';
import type { ResumenRow, TenenciaActual } from '@/types';
import { fmtUSD, fmtPct } from '@/lib/parser';
import {
  PALETA_TIPO, RIESGO_COLOR, RIESGO_LABEL, MONEDA_COLOR,
  RENTA_COLOR, GEO_COLOR, MONEDA_LABEL, RENTA_LABEL, GEO_LABEL,
} from '@/lib/constants';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';

interface Props {
  resumenSeries: ResumenRow[];
  tenenciasPorMes: Record<string, TenenciaActual[]>;
  mesesDisponibles: string[];
  totalPorMes: Record<string, number>;
  hideValues: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function signo(n: number) { return n >= 0 ? '▲' : '▼'; }

function VariacionBadge({ value, pct }: { value: number; pct: number }) {
  const color = value >= 0 ? 'var(--up)' : 'var(--down)';
  return (
    <span style={{ color, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
      {signo(value)} {fmtUSD(Math.abs(value))} ({fmtPct(pct)})
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--primary)',
      margin: 0, padding: '16px 0 8px',
      borderBottom: '1px solid var(--border)',
    }}>{children}</h3>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 18px',
      ...style,
    }}>{children}</div>
  );
}

// ── tooltip del bar chart ─────────────────────────────────────────────────────

function TooltipDelta({ active, payload, label }: {
  active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <p style={{ margin: 0, color: 'var(--text-sec)', fontWeight: 600 }}>{label}</p>
      {payload.map((p) => {
        const val = p.value;
        const isGanancia = p.dataKey === 'ganancia';
        return (
          <p key={p.dataKey} style={{ margin: '4px 0 0', color: val >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 700 }}>
            {isGanancia ? 'Ganancia: ' : 'Δ Cartera: '}
            {signo(val)} {fmtUSD(Math.abs(val))}
          </p>
        );
      })}
    </div>
  );
}

// ── dimensiones ───────────────────────────────────────────────────────────────

type DimKey = 'TIPO' | 'RIESGO' | 'MONEDA' | 'RENTA' | 'SECTOR_GEO';

function getLabel(dim: DimKey, key: string): string {
  if (dim === 'RIESGO') return RIESGO_LABEL[Number(key)] ?? key;
  if (dim === 'MONEDA') return MONEDA_LABEL[key] ?? key;
  if (dim === 'RENTA')  return RENTA_LABEL[key]  ?? key;
  if (dim === 'SECTOR_GEO') return GEO_LABEL[key] ?? key;
  return key;
}

function getColor(dim: DimKey, key: string): string {
  if (dim === 'TIPO')   return PALETA_TIPO[key] ?? '#aaa';
  if (dim === 'RIESGO') return RIESGO_COLOR[RIESGO_LABEL[Number(key)] ?? key] ?? '#aaa';
  if (dim === 'MONEDA') return MONEDA_COLOR[key] ?? '#aaa';
  if (dim === 'RENTA')  return RENTA_COLOR[key]  ?? '#aaa';
  if (dim === 'SECTOR_GEO') return GEO_COLOR[key] ?? '#aaa';
  return '#aaa';
}

function calcTotalDim(items: TenenciaActual[], dim: DimKey): Record<string, number> {
  const acc: Record<string, number> = {};
  const src = dim === 'SECTOR_GEO'
    ? items.filter(t => t.RENTA === 'VAR' || t.RENTA === 'VARIABLE')
    : items;
  for (const t of src) {
    const k = String(t[dim]);
    acc[k] = (acc[k] ?? 0) + t.tenencia_usd;
  }
  return acc;
}

// ── fila de variación por dimensión ──────────────────────────────────────────

interface DimRow {
  rawKey: string;
  label: string;
  color: string;
  anterior: number;
  actual: number;
  pctAnt: number;  // participación relativa mes anterior
  pctAct: number;  // participación relativa mes actual
}

function DimChips({ rows, totalAnterior: _ }: { rows: DimRow[]; totalAnterior: number }) {
  // total del grupo para mapear el delta en la misma escala que pctAct
  const totalGrupo = rows.reduce((s, r) => s + r.actual, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((r) => {
        const delta    = r.actual - r.anterior;
        const deltaPct = r.anterior > 0 ? (delta / r.anterior) * 100 : 0;
        const varColor = delta >= 0 ? 'var(--up)' : 'var(--down)';
        const deltaPositivo = delta >= 0;

        // barra base: participación actual sobre el total del grupo
        const wAct = Math.min(r.pctAct, 100);
        // variación en la misma escala: |delta| / totalGrupo * 100
        const wDelta = Math.min((Math.abs(delta) / totalGrupo) * 100, 100 - wAct);

        // centro del segmento semitransparente
        const wSegStart = r.anterior > 0
          ? (deltaPositivo ? wAct : Math.max(wAct - wDelta, 0))
          : 0;
        const wSegWidth = r.anterior > 0 ? wDelta : wAct;
        const labelAt   = Math.min(Math.max(wSegStart + wSegWidth / 2, 1), 98);
        const flip = false; // centrado siempre usa translateX(-50%)

        return (
          <div key={r.rawKey} style={{
            background: `color-mix(in srgb, ${r.color} 6%, var(--card))`,
            border: `1px solid color-mix(in srgb, ${r.color} 20%, var(--border))`,
            borderRadius: 8,
            padding: '8px 14px 9px',
          }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sec)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{r.label}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{fmtUSD(r.actual)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sec)', lineHeight: 1 }}>{r.pctAct.toFixed(1)}%</span>
              {r.anterior > 0 && (
                <span style={{ fontSize: 10, fontWeight: 600, color: delta >= 0 ? 'var(--up)' : 'var(--down)', lineHeight: 1 }}>
                  {(r.pctAct - r.pctAnt) >= 0 ? '+' : ''}{(r.pctAct - r.pctAnt).toFixed(1)}pp
                </span>
              )}
            </div>

            {/* barra única */}
            <div style={{ position: 'relative', height: 8, borderRadius: 4, overflow: 'hidden', background: `color-mix(in srgb, ${r.color} 8%, var(--border))` }}>
              {/* sólido: solo si hay anterior, hasta wAct menos el delta */}
              {r.anterior > 0 && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${deltaPositivo ? wAct : Math.max(wAct - wDelta, 0)}%`,
                  background: r.color,
                }} />
              )}
              {/* semitransparente verde: crecimiento pegado al extremo de la barra */}
              {deltaPositivo && wDelta > 0 && (
                <div style={{
                  position: 'absolute', left: `${r.anterior > 0 ? wAct : 0}%`, top: 0, height: '100%',
                  width: `${r.anterior > 0 ? wDelta : wAct}%`,
                  background: 'rgba(34,211,160,0.6)',
                }} />
              )}
              {/* semitransparente rojo: reducción al final de la barra */}
              {!deltaPositivo && wDelta > 0 && (
                <div style={{
                  position: 'absolute', left: `${Math.max(wAct - wDelta, 0)}%`, top: 0, height: '100%',
                  width: `${wDelta}%`,
                  background: 'rgba(244,63,94,0.6)',
                }} />
              )}
            </div>

            {/* etiqueta Δ debajo */}
            <div style={{ position: 'relative', height: 16, marginTop: 3 }}>
              <span style={{
                position: 'absolute',
                left: `${labelAt}%`, top: 0,
                transform: 'translateX(-50%)',
                fontSize: 10, fontWeight: 700, color: varColor,
                whiteSpace: 'nowrap', lineHeight: '16px',
              }}>
                {delta >= 0 ? '+' : ''}{fmtUSD(delta)}{r.anterior > 0 ? ` (${delta >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── componente principal ──────────────────────────────────────────────────────

export default function InformeTab({
  resumenSeries,
  tenenciasPorMes,
  mesesDisponibles,
  totalPorMes,
  hideValues,
}: Props) {
  const puedeAnalizar = resumenSeries.length >= 2;

  const computed = useMemo(() => {
    if (!puedeAnalizar) return null;
    return computeInforme(resumenSeries, tenenciasPorMes, mesesDisponibles, totalPorMes);
  }, [resumenSeries, tenenciasPorMes, mesesDisponibles, totalPorMes, puedeAnalizar]);

  if (!puedeAnalizar || !computed) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
        Se necesitan al menos 2 meses de datos para generar el informe.
      </div>
    );
  }

  const {
    mesActual, mesAnterior,
    cartActual, cartAnterior, deltaCartera, pctCartera,
    aportActual, aportAnterior, deltaAporte,
    gananciaPura, pctGananciaPura,
    rendActual, rendAnterior, deltaRend,
    barData,
    dimVariaciones,
  } = computed;

  const DIMS: { key: DimKey; label: string }[] = [
    { key: 'TIPO',       label: 'Tipo de Activo' },
    { key: 'RIESGO',     label: 'Nivel de Riesgo' },
    { key: 'MONEDA',     label: 'Moneda' },
    { key: 'RENTA',      label: 'Tipo de Renta' },
    { key: 'SECTOR_GEO', label: 'Geografía' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 24 }}>

      {/* ── Período ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 12px', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Comparando</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: 'var(--text)',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '2px 8px',
        }}>{mesAnterior}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>→</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: 'var(--primary)',
          background: 'var(--primary-dim)', border: '1px solid var(--primary)',
          borderRadius: 6, padding: '2px 8px',
        }}>{mesActual}</span>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────────── */}
      <SectionTitle>Variaciones principales</SectionTitle>
      <div className="kpi-grid" style={{ marginTop: 10 }}>

        <Card>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px' }}>
            Total Cartera
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
            {hideValues ? '***' : fmtUSD(cartActual)}
          </p>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 2px' }}>vs {mesAnterior}: {hideValues ? '***' : fmtUSD(cartAnterior)}</p>
            {!hideValues && <VariacionBadge value={deltaCartera} pct={pctCartera} />}
          </div>
        </Card>

        <Card>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 4px' }}>
            Ganancia Pura del Mes
          </p>
          <p style={{ fontSize: 10, color: 'var(--muted)', margin: '0 0 6px', fontStyle: 'italic' }}>
            Δ cartera − aportes netos
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, color: gananciaPura >= 0 ? 'var(--up)' : 'var(--down)', margin: '0 0 4px' }}>
            {hideValues ? '***' : `${signo(gananciaPura)} ${fmtUSD(Math.abs(gananciaPura))}`}
          </p>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 2px' }}>
              Aportes del mes: {hideValues ? '***' : fmtUSD(aportActual)}
              {aportAnterior > 0 && !hideValues && ` (ant: ${fmtUSD(aportAnterior)})`}
            </p>
            {!hideValues && (
              <span style={{ fontSize: 12, fontWeight: 700, color: gananciaPura >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {fmtPct(pctGananciaPura)} sobre cartera anterior
              </span>
            )}
          </div>
        </Card>

        <Card>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px' }}>
            Rendimiento Acumulado
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
            {hideValues ? '***' : fmtUSD(rendActual)}
          </p>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 2px' }}>vs {mesAnterior}: {hideValues ? '***' : fmtUSD(rendAnterior)}</p>
            {!hideValues && <VariacionBadge value={deltaRend} pct={rendAnterior !== 0 ? (deltaRend / Math.abs(rendAnterior)) * 100 : 0} />}
          </div>
        </Card>

      </div>

      {/* ── Gráfico ganancia pura vs delta cartera ────────────────────────────── */}
      <SectionTitle>Ganancia pura mensual</SectionTitle>
      <Card style={{ marginTop: 10, padding: '16px 8px 8px' }}>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px 12px' }}>
          Barra sólida = ganancia pura (sin aportes) · Trazo = variación total de cartera
        </p>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={barData} margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
            <XAxis dataKey="mes" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: 'var(--muted)', fontSize: 10 }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              width={44}
            />
            <Tooltip content={<TooltipDelta />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
            <Bar dataKey="ganancia" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {barData.map((e, i) => (
                <Cell key={i} fill={e.ganancia >= 0 ? 'var(--up)' : 'var(--down)'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Variación por dimensión ──────────────────────────────────────────── */}
      {DIMS.map(({ key, label }) => {
        const rows = dimVariaciones[key] ?? [];
        if (!rows.length) return null;
        return (
          <div key={key}>
            <SectionTitle>{label}</SectionTitle>
            <div style={{ marginTop: 10 }}>
              <DimChips rows={rows} totalAnterior={cartAnterior} />
            </div>
          </div>
        );
      })}

    </div>
  );
}

// ── cálculo ───────────────────────────────────────────────────────────────────

interface DimVariacionMap {
  TIPO: DimRow[];
  RIESGO: DimRow[];
  MONEDA: DimRow[];
  RENTA: DimRow[];
  SECTOR_GEO: DimRow[];
}

function computeInforme(
  resumenSeries: ResumenRow[],
  tenenciasPorMes: Record<string, TenenciaActual[]>,
  mesesDisponibles: string[],
  totalPorMes: Record<string, number>,
) {
  const sorted     = Object.keys(tenenciasPorMes).sort();
  const keyActual  = sorted[sorted.length - 1];
  const keyAnt     = sorted[sorted.length - 2];

  const tenActual  = tenenciasPorMes[keyActual] ?? [];
  const tenAnt     = tenenciasPorMes[keyAnt]    ?? [];

  // Totales de cartera
  const cartActual  = totalPorMes[keyActual] ?? 0;
  const cartAnterior = totalPorMes[keyAnt]   ?? 0;
  const deltaCartera = cartActual - cartAnterior;
  const pctCartera   = cartAnterior > 0 ? (deltaCartera / cartAnterior) * 100 : 0;

  // Aportes y rendimiento desde resumenSeries
  const rowActual  = resumenSeries[resumenSeries.length - 1];
  const rowAnt     = resumenSeries[resumenSeries.length - 2];
  const aportActual  = rowActual?.aportes    ?? 0;
  const aportAnterior = rowAnt?.aportes      ?? 0;
  const deltaAporte  = aportActual - aportAnterior;
  const rendActual   = rowActual?.rendimiento ?? 0;
  const rendAnterior = rowAnt?.rendimiento    ?? 0;
  const deltaRend    = rendActual - rendAnterior;

  // Ganancia pura: variación de cartera descontando aportes netos del mes
  const gananciaPura    = deltaCartera - aportActual;
  const pctGananciaPura = cartAnterior > 0 ? (gananciaPura / cartAnterior) * 100 : 0;

  // Labels de mes
  const mesActual  = mesesDisponibles[mesesDisponibles.length - 1] ?? keyActual;
  const mesAnterior = mesesDisponibles[mesesDisponibles.length - 2] ?? keyAnt;

  // Barras: ganancia pura por mes histórico
  const barData = resumenSeries.slice(1).map((row, i) => {
    const prevCartera = resumenSeries[i].total_cartera;
    const deltaCart   = row.total_cartera - prevCartera;
    const ganancia    = deltaCart - row.aportes;
    return { mes: row.fecha, ganancia, delta: deltaCart };
  });

  // Variación por dimensión con participación relativa
  const DIMS: DimKey[] = ['TIPO', 'RIESGO', 'MONEDA', 'RENTA', 'SECTOR_GEO'];
  const dimVariaciones = {} as DimVariacionMap;

  for (const dim of DIMS) {
    const mapAct = calcTotalDim(tenActual, dim);
    const mapAnt = calcTotalDim(tenAnt,    dim);
    const totalAct = Object.values(mapAct).reduce((s, v) => s + v, 0) || 1;
    const totalAnt = Object.values(mapAnt).reduce((s, v) => s + v, 0) || 1;
    const keys = Array.from(new Set([...Object.keys(mapAct), ...Object.keys(mapAnt)]));

    dimVariaciones[dim] = keys
      .map(k => ({
        rawKey:  k,
        label:   getLabel(dim, k),
        color:   getColor(dim, k),
        anterior: mapAnt[k] ?? 0,
        actual:   mapAct[k] ?? 0,
        pctAnt:  ((mapAnt[k] ?? 0) / totalAnt) * 100,
        pctAct:  ((mapAct[k] ?? 0) / totalAct) * 100,
      }))
      .sort((a, b) => b.actual - a.actual);
  }

  return {
    mesActual, mesAnterior,
    cartActual, cartAnterior, deltaCartera, pctCartera,
    aportActual, aportAnterior, deltaAporte,
    gananciaPura, pctGananciaPura,
    rendActual, rendAnterior, deltaRend,
    barData,
    dimVariaciones,
  };
}
