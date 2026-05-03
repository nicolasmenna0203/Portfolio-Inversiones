'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  Cell,
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
    const ganancia = prevCartera !== null ? (row.total_cartera - prevCartera) - row.aportes : null;
    return { ...row, activos: tenenciasPorMes[key]?.length ?? null, ganancia };
  });
}

function TooltipContent({ active, payload, label, hideValues }: any) {
  if (!active || !payload?.length) return null;

  const ORDER = ['total_cartera', 'acumulado', 'ganancia', 'activos'];
  const sorted = [...payload].sort(
    (a, b) => ORDER.indexOf(a.dataKey) - ORDER.indexOf(b.dataKey)
  );

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      minWidth: 160,
    }}>
      <p style={{ fontWeight: 600, color: 'var(--text-sec)', marginBottom: 8, fontSize: 11 }}>{label}</p>
      {sorted.map((p: any) => {
        if (p.value === null || p.value === undefined) return null;
        let display: string;
        let color = p.color;
        if (p.dataKey === 'activos') {
          display = `${p.value} activos`;
        } else if (p.dataKey === 'ganancia') {
          const isPos = p.value >= 0;
          color = isPos ? 'var(--up)' : 'var(--down)';
          display = hideValues ? '···' : `${isPos ? '+' : ''}${fmtUSD(p.value)}`;
        } else {
          display = hideValues ? '···' : fmtUSD(p.value);
        }
        return (
          <p key={p.dataKey} style={{ color, marginBottom: 3, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--muted)' }}>{p.name}</span>
            <span style={{ fontWeight: 600 }}>{display}</span>
          </p>
        );
      })}
    </div>
  );
}

export default function EvolucionChart({ data, tenenciasPorMes, hideValues }: Props) {
  const chartData = buildData(data, tenenciasPorMes);
  const [isMobile, setIsMobile] = useState(false);

  const ganMax = Math.max(
    ...chartData.map(d => Math.abs(d.ganancia ?? 0)).filter(v => v > 0),
    1
  );
  const ganDomain: [number, number] = [-ganMax * 1.2, ganMax * 1.2];

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px 8px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-sec)', margin: 0 }}>
          Evolución de la Cartera
        </p>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>
          Barras = ganancia pura mensual · Áreas = cartera y aportes
        </span>
      </div>
      <div style={{ flex: 1, minHeight: isMobile ? 0 : 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: isMobile ? 8 : 45, left: isMobile ? 0 : 10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="gradCartera" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#00d4c2" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#00d4c2" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradAportes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.14} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="fecha"
            tick={{ fill: 'var(--muted)', fontSize: isMobile ? 9 : 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="usd"
            tickFormatter={(v) => hideValues ? '···' : `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: 'var(--muted)', fontSize: isMobile ? 9 : 11 }}
            tickLine={false}
            axisLine={false}
            width={isMobile ? 38 : 52}
          />
          <YAxis
            yAxisId="gan"
            orientation="right"
            domain={ganDomain}
            hide={true}
          />
          <YAxis
            yAxisId="cnt"
            orientation="right"
            tickFormatter={(v) => String(Math.round(v))}
            tick={{ fill: 'var(--muted)', fontSize: isMobile ? 9 : 11 }}
            tickLine={false}
            axisLine={false}
            width={isMobile ? 22 : 32}
            allowDecimals={false}
          />
          <Tooltip content={<TooltipContent hideValues={hideValues} />} />
          <Legend
            iconType="plainline"
            iconSize={16}
            wrapperStyle={{ color: 'var(--text-sec)', fontSize: isMobile ? 10 : 11, paddingTop: 10 }}
          />
          <Bar
            yAxisId="gan"
            dataKey="ganancia"
            name="Ganancia pura"
            maxBarSize={isMobile ? 14 : 20}
            radius={[3, 3, 0, 0]}
          >
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={(entry.ganancia ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'}
                fillOpacity={0.75}
              />
            ))}
          </Bar>
          <Area
            yAxisId="usd"
            type="monotone"
            dataKey="total_cartera"
            name="Total Cartera"
            stroke="#00d4c2"
            strokeWidth={2.5}
            fill="url(#gradCartera)"
            dot={false}
            activeDot={{ r: 5, fill: '#00d4c2', strokeWidth: 0 }}
          />
          <Area
            yAxisId="usd"
            type="monotone"
            dataKey="acumulado"
            name="Aportes Acumulados"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#gradAportes)"
            dot={false}
            activeDot={{ r: 5, fill: '#3b82f6', strokeWidth: 0 }}
          />
          <Line
            yAxisId="cnt"
            type="monotone"
            dataKey="activos"
            name="Activos"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="3 5"
            dot={false}
            activeDot={{ r: 4, fill: '#94a3b8', strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
