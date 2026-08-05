'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer,
} from 'recharts';
import type { IngresosResponse } from '@/types';
import { fmtARS, fmtUSD } from '@/lib/parser';
import KPICard from './KPICard';

interface Props {
  hideValues: boolean;
}

// Paleta fija por empleador, asignada en orden de aparición (nunca por índice
// recalculado al filtrar, para que un empleador no cambie de color si otro
// desaparece del set visible).
const EMPLEADOR_COLORS = ['#cfab6e', '#5fb896', '#8d7fc7', '#d9824e', '#6fa8d6', '#c15c4a'];

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
        p.value > 0 && (
          <p key={p.dataKey} style={{ margin: '2px 0', color: p.color, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{p.name}</span>
            <strong>{fmtARS(p.value)}</strong>
          </p>
        )
      ))}
    </div>
  );
}

export default function IngresosSection({ hideValues }: Props) {
  const [resp, setResp] = useState<IngresosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/ingresos')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setResp(json as IngresosResponse);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const empleadorColor = useMemo(() => {
    const map = new Map<string, string>();
    (resp?.empleadores ?? []).forEach((emp, i) => map.set(emp, EMPLEADOR_COLORS[i % EMPLEADOR_COLORS.length]));
    return map;
  }, [resp]);

  // Serie mensual: una barra apilada por empleador, en ARS.
  const chartData = useMemo(() => {
    if (!resp) return [];
    return resp.porMes.map((m) => {
      const row: Record<string, number | string> = { mes: m.fecha };
      for (const emp of resp.empleadores) {
        row[emp] = m.rows.filter((r) => r.empleador === emp).reduce((s, r) => s + r.montoArs, 0);
      }
      return row;
    });
  }, [resp]);

  const kpis = useMemo(() => {
    if (!resp || resp.ingresos.length === 0) return null;
    const totalArs = resp.ingresos.reduce((s, r) => s + r.montoArs, 0);
    const totalUsd = resp.ingresos.reduce((s, r) => s + r.montoUsd, 0);
    const ultimoMes = resp.porMes[resp.porMes.length - 1];
    return { totalArs, totalUsd, ultimoMes };
  }, [resp]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Cargando ingresos...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8, padding: '14px 18px', margin: 12,
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', margin: '0 0 4px' }}>Error</p>
        <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (!resp || resp.ingresos.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Todavía no hay ingresos cargados. Usá &quot;Cargar&quot; → &quot;Sueldos / Haberes&quot; para subir un resumen de cuenta.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      <div className="kpi-grid">
        <KPICard
          label="Total acumulado (ARS)"
          value={hideValues ? '***' : fmtARS(kpis!.totalArs)}
          sub={`${resp.empleadores.length} empleador${resp.empleadores.length !== 1 ? 'es' : ''}`}
          accentColor="var(--primary)"
        />
        <KPICard
          label="Total acumulado (USD)"
          value={hideValues ? '***' : kpis!.totalUsd > 0 ? fmtUSD(kpis!.totalUsd) : 's/d'}
          sub="ingresos acreditados en dólares"
          accentColor="var(--primary)"
        />
        <KPICard
          label="Último mes"
          value={hideValues ? '***' : kpis!.ultimoMes ? fmtARS(kpis!.ultimoMes.totalArs) : 's/d'}
          sub={kpis!.ultimoMes?.fecha ?? ''}
          accentColor="var(--up)"
        />
      </div>

      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', flex: 1, minHeight: 280,
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px' }}>
          Ingresos por mes y empleador (ARS)
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => hideValues ? '***' : new Intl.NumberFormat('es-AR', { notation: 'compact' }).format(v)}
              width={hideValues ? 40 : 56}
            />
            <Tooltip content={hideValues ? () => null : <CustomTooltip />} />
            {resp.empleadores.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {resp.empleadores.map((emp) => (
              <Bar key={emp} dataKey={emp} stackId="ingresos" fill={empleadorColor.get(emp)} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px',
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px' }}>
          Detalle de acreditaciones
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' }}>
          {[...resp.ingresos].reverse().map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)',
                fontSize: 13,
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: empleadorColor.get(r.empleador) ?? 'var(--primary)',
              }} />
              <span style={{ color: 'var(--muted)', width: 90, flexShrink: 0 }}>{r.fechaStr}</span>
              <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1 }}>{r.empleador}</span>
              <span style={{ color: 'var(--text-sec)', fontSize: 12 }}>{r.concepto}</span>
              <span style={{ color: 'var(--up)', fontWeight: 600, flexShrink: 0 }}>
                {hideValues ? '***' : r.montoArs > 0 ? fmtARS(r.montoArs) : fmtUSD(r.montoUsd)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
