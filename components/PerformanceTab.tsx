'use client';

import { useMemo, useState } from 'react';
import type { DashboardData } from '@/types';
import { tickersDeCartera } from '@/lib/tickersElegibles';
import RentaFijaSection from './RentaFijaSection';
import RentaVariableSection from './RentaVariableSection';
import CarryTradeSection from './CarryTradeSection';

interface Props {
  data: DashboardData;
}

type SubTab = 'fija' | 'variable' | 'carry';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'fija',     label: 'Renta Fija' },
  { id: 'variable', label: 'Renta Variable' },
  { id: 'carry',    label: 'Carry Trade' },
];

export default function PerformanceTab({ data }: Props) {
  const { tenenciasPorMes } = data;

  const { tenencias, tickersUsa } = useMemo(() => {
    const meses = Object.keys(tenenciasPorMes).sort();
    const ultimoMes = meses[meses.length - 1];
    return tickersDeCartera(tenenciasPorMes[ultimoMes] ?? []);
  }, [tenenciasPorMes]);

  const [subTab, setSubTab] = useState<SubTab>('fija');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0,
      overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 24,
    }}>

      {/* ── Selector Renta Fija / Renta Variable ─────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        {SUB_TABS.map((t) => {
          const activo = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className="pill-touch"
              aria-pressed={activo}
              style={{
                padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', border: '1px solid',
                borderColor: activo ? 'var(--primary)' : 'var(--border)',
                background: activo ? 'var(--primary-dim)' : 'transparent',
                color: activo ? 'var(--primary)' : 'var(--muted)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'fija' && <RentaFijaSection tenencias={tenencias} />}
      {subTab === 'variable' && <RentaVariableSection tickersUsa={tickersUsa} tenencias={tenencias} />}
      {subTab === 'carry' && <CarryTradeSection tenencias={tenencias} />}
    </div>
  );
}
