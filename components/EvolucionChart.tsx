'use client';

import { useEffect, useState } from 'react';
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
  return data.map((row) => {
    const d = new Date(row.fechaTs);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { ...row, activos: tenenciasPorMes[key]?.length ?? null };
  });
}

function TooltipContent({ active, payload, label, hideValues }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <p style={{ fontWeight: 600, color: 'var(--text-sec)', marginBottom: 6, fontSize: 11 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          <span style={{ color: 'var(--muted)', marginRight: 6 }}>{p.name}:</span>
          {p.dataKey === 'activos'
            ? `${p.value} activos`
            : hideValues ? '···' : fmtUSD(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function EvolucionChart({ data, tenenciasPorMes, hideValues }: Props) {
  const chartData = buildData(data, tenenciasPorMes);
  const [isMobile, setIsMobile] = useState(false);

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
      <p style={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: 'var(--text-sec)',
        marginBottom: 10,
        flexShrink: 0,
      }}>
        Evolución de la Cartera
      </p>
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
          {!isMobile && (
            <YAxis
              yAxisId="cnt"
              orientation="right"
              tickFormatter={(v) => String(Math.round(v))}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={32}
              allowDecimals={false}
            />
          )}
          <Tooltip content={<TooltipContent hideValues={hideValues} />} />
          <Legend
            iconType="plainline"
            iconSize={16}
            wrapperStyle={{ color: 'var(--text-sec)', fontSize: isMobile ? 10 : 11, paddingTop: 10 }}
          />
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
          {!isMobile && (
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
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
