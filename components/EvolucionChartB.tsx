'use client';

import { useEffect, useId, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ResumenRow, TenenciaActual } from '@/types';
import { fmtUSD } from '@/lib/parser';

interface Props {
  data: ResumenRow[];
  tenenciasPorMes: Record<string, TenenciaActual[]>;
  hideValues?: boolean;
}

function buildData(data: ResumenRow[], tenenciasPorMes: Record<string, TenenciaActual[]>) {
  return data.map((row, i) => {
    const d = new Date(row.fechaTs);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const prevCartera = i > 0 ? data[i - 1].total_cartera : null;
    const ganancia = prevCartera !== null ? (row.total_cartera - prevCartera) - row.aportes : 0;
    // rendimiento = cartera - aportes acumulados (brecha entre ambas curvas)
    const rendimiento = row.total_cartera - row.acumulado;
    return { ...row, activos: tenenciasPorMes[key]?.length ?? null, ganancia, rendimiento };
  });
}

function TooltipContent({ active, payload, label, hideValues }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  const rendimiento = entry?.rendimiento ?? 0;
  const rendColor = rendimiento >= 0 ? 'var(--up)' : 'var(--down)';

  const ORDER = ['total_cartera', 'acumulado', 'activos'];
  const filtered = payload.filter((p: any) => ORDER.includes(p.dataKey));
  const sorted = [...filtered].sort((a, b) => ORDER.indexOf(a.dataKey) - ORDER.indexOf(b.dataKey));

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 168,
    }}>
      <p style={{ fontWeight: 600, color: 'var(--text-sec)', marginBottom: 8, fontSize: 11 }}>{label}</p>
      {sorted.map((p: any) => {
        if (p.value === null || p.value === undefined) return null;
        const display = p.dataKey === 'activos'
          ? `${p.value} activos`
          : hideValues ? '···' : fmtUSD(p.value);
        return (
          <p key={p.dataKey} style={{ color: p.color, marginBottom: 3, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--muted)' }}>{p.name}</span>
            <span style={{ fontWeight: 600 }}>{display}</span>
          </p>
        );
      })}
      <p style={{ color: rendColor, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 700 }}>
        <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Rendimiento</span>
        <span>{hideValues ? '···' : `${rendimiento >= 0 ? '+' : ''}${fmtUSD(rendimiento)}`}</span>
      </p>
      <p style={{ color: entry?.ganancia >= 0 ? 'var(--up)' : 'var(--down)', marginTop: 3, display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 700, fontSize: 11 }}>
        <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Ganancia del mes</span>
        <span>{hideValues ? '···' : `${entry?.ganancia >= 0 ? '+' : ''}${fmtUSD(entry?.ganancia ?? 0)}`}</span>
      </p>
    </div>
  );
}

export default function EvolucionChartB({ data, tenenciasPorMes, hideValues }: Props) {
  const chartData = buildData(data, tenenciasPorMes);
  const [isMobile, setIsMobile] = useState(false);
  const uid = useId().replace(/:/g, '');

  // Color de la banda: verde si rendimiento final es positivo, rojo si negativo
  const lastRendimiento = chartData[chartData.length - 1]?.rendimiento ?? 0;
  const bandColor = lastRendimiento >= 0 ? '#22d3a0' : '#f43f5e';

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 16px 8px',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-sec)', margin: 0 }}>
          Evolución de la Cartera
        </p>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>
          Banda = rendimiento acumulado (cartera − aportes)
        </span>
      </div>
      <div style={{ flex: 1, minHeight: isMobile ? 0 : 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: isMobile ? 8 : 45, left: isMobile ? 0 : 10, bottom: 0 }}>
            <defs>
              {/* banda de rendimiento entre cartera y aportes */}
              <linearGradient id={`gradBand${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={bandColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={bandColor} stopOpacity={0.05} />
              </linearGradient>
              {/* relleno sutil bajo aportes */}
              <linearGradient id={`gradAp${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.10} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fill: 'var(--muted)', fontSize: isMobile ? 9 : 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis yAxisId="usd" tickFormatter={(v) => hideValues ? '···' : `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--muted)', fontSize: isMobile ? 9 : 11 }} tickLine={false} axisLine={false} width={isMobile ? 38 : 52} />
            <YAxis yAxisId="cnt" orientation="right" tickFormatter={(v) => String(Math.round(v))} tick={{ fill: 'var(--muted)', fontSize: isMobile ? 9 : 11 }} tickLine={false} axisLine={false} width={isMobile ? 22 : 32} allowDecimals={false} />
            <Tooltip content={<TooltipContent hideValues={hideValues} />} />
            <Legend iconType="plainline" iconSize={16} wrapperStyle={{ color: 'var(--text-sec)', fontSize: isMobile ? 10 : 11, paddingTop: 10 }} />

            {/* aportes: base de referencia, relleno sutil */}
            <Area
              yAxisId="usd" type="monotone" dataKey="acumulado"
              name="Aportes Acumulados"
              stroke="#3b82f6" strokeWidth={1.5}
              fill={`url(#gradAp${uid})`}
              dot={false} activeDot={{ r: 5, fill: '#3b82f6', strokeWidth: 0 }}
            />
            {/* cartera: línea superior, relleno = banda de rendimiento con baseValue="dataMin" para que arranque desde aportes */}
            <Area
              yAxisId="usd" type="monotone" dataKey="total_cartera"
              name="Total Cartera"
              stroke="#00d4c2" strokeWidth={2.5}
              fill={`url(#gradBand${uid})`}
              dot={false} activeDot={{ r: 5, fill: '#00d4c2', strokeWidth: 0 }}
            />
            <Line yAxisId="cnt" type="monotone" dataKey="activos" name="Activos" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 5" dot={false} activeDot={{ r: 4, fill: '#94a3b8', strokeWidth: 0 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
