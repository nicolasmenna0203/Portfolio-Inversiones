'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { DashboardData, BenchmarksResponse, BenchmarkId } from '@/types';
import { toMesKey } from '@/lib/parser';

interface Props {
  data: DashboardData;
}

type SeriesId = 'cartera' | BenchmarkId;

// Colores asignados por lo que cada serie representa, no arbitrarios:
// verde-agua de marca para la cartera propia, azul para el mercado USD (S&P500),
// naranja oficial de Bitcoin, dorado para oro, celeste (bandera ARG) para el MEP,
// rojo para inflación (costo/alerta a superar). Validado con el validador de
// paletas del skill dataviz: separación CVD ΔE 19.6, contraste ≥3:1 en dark.
const SERIES_META: Record<SeriesId, { label: string; color: string }> = {
  cartera:   { label: 'Mi Cartera',              color: '#00d4c2' },
  sp500:     { label: 'S&P 500',                 color: '#4a7fd6' },
  inflacion: { label: 'Inflación (IPC INDEC)',   color: '#ef553b' },
  mep:       { label: 'Dólar MEP',               color: '#5fc9e8' },
  btc:       { label: 'Bitcoin',                 color: '#f7931a' },
  oro:       { label: 'Oro',                     color: '#d4b95e' },
};

const SERIES_ORDER: SeriesId[] = ['cartera', 'sp500', 'inflacion', 'mep', 'btc', 'oro'];

const VISIBLE_KEY = 'benchmarks_visible_v1';

function loadVisible(): Record<SeriesId, boolean> {
  const defaults = { cartera: true, sp500: true, inflacion: true, mep: true, btc: true, oro: true };
  try {
    const s = localStorage.getItem(VISIBLE_KEY);
    if (s) return { ...defaults, ...JSON.parse(s) };
  } catch {}
  return defaults;
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <p style={{ margin: '0 0 6px', color: 'var(--muted)', fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        p.value != null && (
          <p key={p.dataKey} style={{ margin: '2px 0', color: p.color, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{p.name}</span>
            <strong>{p.value.toFixed(1)}</strong>
          </p>
        )
      ))}
    </div>
  );
}

export default function BenchmarksTab({ data }: Props) {
  const { resumenSeries } = data;

  const [visible, setVisible] = useState<Record<SeriesId, boolean>>(loadVisible);
  const [resp, setResp] = useState<BenchmarksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: SeriesId) {
    setVisible((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(VISIBLE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const mesesCartera = useMemo(() => resumenSeries.map((r) => toMesKey(r.fechaTs)), [resumenSeries]);

  useEffect(() => {
    if (mesesCartera.length === 0) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/benchmarks?meses=${mesesCartera.join(',')}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setResp(json as BenchmarksResponse);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesesCartera.join(',')]);

  // Cartera como índice TWR (Time-Weighted Return) base 100: encadena el
  // rendimiento puro de cada mes — (total_fin - aportes_del_mes) / total_inicio —
  // para neutralizar el efecto de cuánto/cuándo aportaste y dejar solo el
  // rendimiento de mercado, comparable con los benchmarks externos.
  const carteraBase100 = useMemo(() => {
    const map = new Map<string, number>();
    if (resumenSeries.length === 0) return map;

    let indice = 100;
    map.set(toMesKey(resumenSeries[0].fechaTs), indice);
    for (let i = 1; i < resumenSeries.length; i++) {
      const anterior = resumenSeries[i - 1].total_cartera;
      const actual = resumenSeries[i].total_cartera;
      const aportesMes = resumenSeries[i].aportes;
      if (anterior > 0) {
        const rendimientoMes = (actual - aportesMes) / anterior;
        indice = indice * rendimientoMes;
      }
      map.set(toMesKey(resumenSeries[i].fechaTs), indice);
    }
    return map;
  }, [resumenSeries]);

  // Factor de conversión USD→ARS por mes, relativo al mes base (MEP indexado / 100).
  // Ej: si el MEP subió 30% desde el mes base, factorMep(mes) = 1.30.
  const factorMep = useMemo(() => {
    const map = new Map<string, number>();
    const mepSeries = resp?.series.find((s) => s.id === 'mep');
    for (const p of mepSeries?.puntos ?? []) map.set(p.mesKey, p.valor / 100);
    return map;
  }, [resp]);

  // Todo el gráfico se expresa en ARS: cada serie en USD (cartera TWR, S&P500,
  // oro, BTC) se multiplica por la devaluación acumulada del MEP antes de
  // re-indexar a 100, para que sea comparable en la misma moneda que la
  // inflación (que ya está en ARS). Si el MEP no tiene dato ese mes, se omite
  // el punto en vez de mostrar un valor engañoso. El propio MEP se muestra tal
  // cual (índice de devaluación del peso), sin pasar por la conversión.
  const chartData = useMemo(() => {
    const seriesExternas = resp?.series ?? [];
    return resumenSeries.map((r) => {
      const mesKey = toMesKey(r.fechaTs);
      const fx = factorMep.get(mesKey);

      const carteraUsd = carteraBase100.get(mesKey);
      const row: Record<string, number | string | undefined> = {
        mesKey,
        fecha: r.fecha,
        cartera: carteraUsd != null && fx != null ? carteraUsd * fx : undefined,
      };
      for (const s of seriesExternas) {
        if (s.id === 'inflacion' || s.id === 'mep') {
          row[s.id] = s.puntos.find((p) => p.mesKey === mesKey)?.valor; // ya en ARS / índice propio
          continue;
        }
        const valUsd = s.puntos.find((p) => p.mesKey === mesKey)?.valor;
        row[s.id] = valUsd != null && fx != null ? valUsd * fx : undefined;
      }
      return row;
    });
  }, [resumenSeries, carteraBase100, factorMep, resp]);

  const seriesConError = useMemo(() => {
    const map = new Map<BenchmarkId, string>();
    for (const s of resp?.series ?? []) {
      if (s.error) map.set(s.id, s.error);
    }
    return map;
  }, [resp]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>

      {/* ── Toggles de series ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        {SERIES_ORDER.map((id) => {
          const meta = SERIES_META[id];
          const err = id !== 'cartera' ? seriesConError.get(id as BenchmarkId) : undefined;
          const isVisible = visible[id];
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              disabled={!!err}
              className="pill-touch"
              aria-pressed={isVisible && !err}
              title={err ? `No se pudo cargar: ${err}` : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                cursor: err ? 'not-allowed' : 'pointer',
                border: '1px solid',
                borderColor: isVisible && !err ? meta.color : 'var(--border)',
                background: isVisible && !err ? `${meta.color}22` : 'transparent',
                color: err ? 'var(--muted)' : isVisible ? meta.color : 'var(--muted)',
                opacity: err ? 0.5 : 1,
                transition: 'all 0.12s',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: err ? 'var(--muted)' : meta.color, flexShrink: 0 }} />
              {meta.label}
              {err && ' ⚠'}
            </button>
          );
        })}
      </div>

      {/* ── Estado de carga / error global ────────────────────────────────── */}
      {loading && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Cargando benchmarks…</p>
      )}
      {error && (
        <div style={{
          background: 'var(--card)', border: '1px solid #ef553b', borderRadius: 10,
          padding: '10px 14px', fontSize: 12, color: '#ef553b',
        }}>
          Error cargando benchmarks: {error}
        </div>
      )}

      {/* ── Gráfico ────────────────────────────────────────────────────────── */}
      {!loading && (
        <div className="bench-chart-card" style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '14px 16px 8px',
          flex: 1,
          minHeight: 320,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ marginBottom: 10, flexShrink: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-sec)', margin: 0 }}>
              Rendimiento Relativo (Índice Base 100)
            </p>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              Cartera/S&P500/Oro/Bitcoin convertidos a ARS (vía dólar MEP) · Dólar MEP muestra la devaluación del peso · todas parten de 100 en {resumenSeries[0]?.fecha ?? 'el primer mes'} · Mi Cartera excluye el efecto de aportes/retiros (TWR)
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v) => v.toFixed(0)}
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <ReferenceLine y={100} stroke="var(--muted)" strokeDasharray="3 4" strokeOpacity={0.5} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="plainline"
                  iconSize={16}
                  wrapperStyle={{ color: 'var(--text-sec)', fontSize: 11, paddingTop: 10 }}
                />
                {[...SERIES_ORDER]
                  .filter((id) => visible[id] && !seriesConError.get(id as BenchmarkId))
                  // "cartera" se dibuja último (queda al frente, nunca tapada por los benchmarks)
                  .sort((a, b) => (a === 'cartera' ? 1 : b === 'cartera' ? -1 : 0))
                  .map((id) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      name={SERIES_META[id].label}
                      stroke={SERIES_META[id].color}
                      strokeWidth={id === 'cartera' ? 4 : 2}
                      strokeOpacity={id === 'cartera' ? 1 : 0.65}
                      dot={false}
                      connectNulls
                      activeDot={{ r: id === 'cartera' ? 6 : 5, fill: SERIES_META[id].color, strokeWidth: 0 }}
                    />
                  ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
