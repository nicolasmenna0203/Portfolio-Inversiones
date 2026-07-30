'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Cell, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { CarryTradeItem } from '@/types';
import { usePerformance } from '@/lib/usePerformance';
import { calcularCarryTrade } from '@/lib/carryTrade';
import KPICard from './KPICard';

interface Props {
  tenencias: Record<string, number>;
}

function fmtPct1(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtArs(v: number): string {
  return v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

type SortKey = 'ticker' | 'diasAlVencimiento' | 'tir' | 'retornoDirectoArs' | 'mepBreakeven' | 'devaluacionBreakeven';

interface TooltipPayload {
  payload: CarryTradeItem;
}

function CarryTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  if (!b) return null;
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--text)' }}>{b.ticker}</p>
      <p style={{ margin: '0 0 6px', color: 'var(--muted)', fontSize: 11 }}>Vto. {fmtFecha(b.vencimiento)} · {b.diasAlVencimiento} días</p>
      <p style={{ margin: '2px 0', color: 'var(--text-sec)' }}>TIR (ARS): <strong>{fmtPct1(b.tir)}</strong></p>
      <p style={{ margin: '2px 0', color: 'var(--text-sec)' }}>Retorno directo (ARS): <strong>{fmtPct1(b.retornoDirectoArs)}</strong></p>
      {!Number.isNaN(b.mepBreakeven) && (
        <p style={{ margin: '2px 0', color: 'var(--text-sec)' }}>MEP breakeven: <strong>${fmtArs(b.mepBreakeven)}</strong> ({fmtPct1(b.devaluacionBreakeven)})</p>
      )}
      {b.retornoDirectoUsd != null && (
        <p style={{ margin: '2px 0', color: b.retornoDirectoUsd >= 0 ? 'var(--up)' : 'var(--down)' }}>
          Retorno en USD: <strong>{fmtPct1(b.retornoDirectoUsd)}</strong>
        </p>
      )}
      {b.tenenciaUsd != null && <p style={{ margin: '6px 0 0', color: 'var(--primary)', fontSize: 11 }}>En cartera</p>}
    </div>
  );
}

export default function CarryTradeSection({ tenencias }: Props) {
  const { data: perf, loading, error } = usePerformance(tenencias);

  const [mepEntradaStr, setMepEntradaStr] = useState('');
  const [mepSalidaStr, setMepSalidaStr] = useState('');
  const mepEntrada = mepEntradaStr.trim() === '' ? null : Number(mepEntradaStr);
  const mepSalida = mepSalidaStr.trim() === '' ? null : Number(mepSalidaStr);

  const [sortKey, setSortKey] = useState<SortKey>('diasAlVencimiento');
  const [sortDesc, setSortDesc] = useState(false);

  const items = useMemo(
    () => calcularCarryTrade(perf?.bonos ?? [], mepEntrada, mepSalida),
    [perf, mepEntrada, mepSalida],
  );

  const itemsOrdenados = useMemo(() => {
    const copia = [...items];
    copia.sort((a, b) => {
      const cmp = sortKey === 'ticker' ? a.ticker.localeCompare(b.ticker) : a[sortKey] - b[sortKey];
      return sortDesc ? -cmp : cmp;
    });
    return copia;
  }, [items, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(false); }
  }

  const cabecera = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th
      onClick={() => toggleSort(key)}
      style={{
        cursor: 'pointer', textAlign: align, padding: '8px 10px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: sortKey === key ? 'var(--primary)' : 'var(--muted)', whiteSpace: 'nowrap',
      }}
    >
      {label}{sortKey === key ? (sortDesc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  const enCartera = items.filter((i) => i.tenenciaUsd != null);
  const mejorBreakeven = items.length > 0
    ? items.reduce((max, i) => (!Number.isNaN(i.devaluacionBreakeven) && i.devaluacionBreakeven > max.devaluacionBreakeven ? i : max))
    : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Cargando instrumentos de carry trade…</p>
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

      {/* ── Explicación + inputs de MEP ──────────────────────────────────── */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '14px 16px',
      }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.5 }}>
          Vender USD al MEP de entrada, comprar el instrumento en pesos y mantenerlo hasta el vencimiento,
          para volver a comprar USD al MEP de salida. El <strong>MEP breakeven</strong> es el tipo de cambio al
          que el carry deja de ganarle a quedarse directamente en dólares.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            MEP de entrada (hoy)
            <input
              type="number" inputMode="decimal" placeholder="ej. 1250"
              value={mepEntradaStr}
              onChange={(e) => setMepEntradaStr(e.target.value)}
              style={{
                width: 140, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontWeight: 600,
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            MEP de salida (escenario)
            <input
              type="number" inputMode="decimal" placeholder="ej. 1300"
              value={mepSalidaStr}
              onChange={(e) => setMepSalidaStr(e.target.value)}
              style={{
                width: 140, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontWeight: 600,
              }}
            />
          </label>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="kpi-grid">
        <KPICard
          label="Instrumentos disponibles"
          value={String(items.length)}
          sub="LECAP / Boncap / duales / Tamar / Badlar"
        />
        <KPICard
          label="Mejor devaluación breakeven"
          value={mejorBreakeven && mepEntrada != null ? fmtPct1(mejorBreakeven.devaluacionBreakeven) : '—'}
          sub={mejorBreakeven && mepEntrada != null ? `${mejorBreakeven.ticker} · vto. ${fmtFecha(mejorBreakeven.vencimiento)}` : 'Cargá el MEP de entrada'}
          accentColor="#1baf7a"
        />
        {enCartera.length > 0 && (
          <KPICard
            label="Tu cartera en este grupo"
            value={`${enCartera.length} instrumento${enCartera.length > 1 ? 's' : ''}`}
            sub={enCartera.map((i) => i.ticker).join(' · ')}
            accentColor="var(--primary)"
          />
        )}
      </div>

      {/* ── Gráfico: devaluación breakeven por vencimiento ───────────────── */}
      {mepEntrada != null && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '14px 16px 8px', minHeight: 300, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-sec)', margin: 0 }}>
              Devaluación breakeven por vencimiento
            </p>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              Barra = devaluación del MEP a la que el carry empata con quedarte en dólares · ordenado por vencimiento
            </span>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={items} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="ticker" tick={{ fill: 'var(--muted)', fontSize: 10 }}
                  tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" height={60}
                />
                <YAxis
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  tickLine={false} axisLine={false} width={44}
                />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Tooltip content={<CarryTooltip />} cursor={{ fill: 'var(--border-subtle)' }} />
                <Bar dataKey="devaluacionBreakeven" radius={[4, 4, 0, 0]}>
                  {items.map((i) => (
                    <Cell key={i.ticker} fill={i.tenenciaUsd ? '#1baf7a' : '#1baf7a88'} />
                  ))}
                </Bar>
                {mepSalida != null && (
                  <Line
                    type="monotone" dataKey="retornoDirectoUsd"
                    stroke="#eb6834" strokeWidth={1.5} dot={{ r: 3, fill: '#eb6834' }}
                    isAnimationActive={false} name="Retorno USD al MEP de salida"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Tabla ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        overflow: 'auto', maxHeight: 460,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {cabecera('ticker', 'Ticker', 'left')}
              {cabecera('diasAlVencimiento', 'Vencimiento')}
              {cabecera('tir', 'TIR')}
              <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>TNA</th>
              {cabecera('retornoDirectoArs', 'Retorno directo ARS')}
              {cabecera('mepBreakeven', 'MEP breakeven')}
              {cabecera('devaluacionBreakeven', 'Devaluación breakeven')}
              <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Retorno USD (escenario)</th>
            </tr>
          </thead>
          <tbody>
            {itemsOrdenados.map((i) => (
              <tr
                key={i.ticker}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: i.tenenciaUsd ? '#1baf7a11' : 'transparent',
                }}
              >
                <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--text)' }}>
                  {i.ticker}{i.tenenciaUsd ? ' ★' : ''}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-sec)', whiteSpace: 'nowrap' }}>
                  {fmtFecha(i.vencimiento)} <span style={{ color: 'var(--muted)' }}>({i.diasAlVencimiento}d)</span>
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmtPct1(i.tir)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-sec)' }}>{fmtPct1(i.tna)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-sec)' }}>{fmtPct1(i.retornoDirectoArs)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-sec)' }}>
                  {Number.isNaN(i.mepBreakeven) ? '—' : `$${fmtArs(i.mepBreakeven)}`}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#1baf7a' }}>
                  {Number.isNaN(i.devaluacionBreakeven) ? '—' : fmtPct1(i.devaluacionBreakeven)}
                </td>
                <td style={{
                  padding: '7px 10px', textAlign: 'right', fontWeight: 700,
                  color: i.retornoDirectoUsd == null ? 'var(--muted)' : i.retornoDirectoUsd >= 0 ? 'var(--up)' : 'var(--down)',
                }}>
                  {i.retornoDirectoUsd == null ? '—' : fmtPct1(i.retornoDirectoUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
