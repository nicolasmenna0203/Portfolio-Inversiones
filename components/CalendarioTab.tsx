'use client';

import { useMemo, useState } from 'react';
import type { DashboardData, EventoTipo } from '@/types';
import { useCalendario } from '@/lib/useCalendario';
import { TIPOS_VALIDOS, TICKERS_INCLUIR, TICKERS_EXCLUIR } from '@/lib/tickersElegibles';

interface Props {
  data: DashboardData;
}

const TIPO_EVENTO_META: Record<EventoTipo, { label: string; color: string }> = {
  dividendo: { label: 'Dividendo', color: '#19d3f3' },
  earnings:  { label: 'Balance',   color: '#ef553b' },
};

function fmtFechaEvento(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00Z');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function Pill({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string; onClick: () => void;
}) {
  const c = color ?? 'var(--primary)';
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', border: '1px solid',
        borderColor: active ? c : 'var(--border)',
        background: active ? `${c}22` : 'transparent',
        color: active ? c : 'var(--muted)',
        transition: 'all 0.12s',
      }}
    >{label}</button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {children}
    </div>
  );
}

export default function CalendarioTab({ data }: Props) {
  const { tenenciasPorMes } = data;

  const tickersActivos = useMemo(() => {
    const meses = Object.keys(tenenciasPorMes).sort();
    const ultimoMes = meses[meses.length - 1];
    const items = tenenciasPorMes[ultimoMes] ?? [];
    const set = new Set(
      items
        .filter((t) => {
          const ticker = t.ticker.toUpperCase();
          if (TICKERS_EXCLUIR.has(ticker)) return false;
          if (TICKERS_INCLUIR.has(ticker)) return true;
          return TIPOS_VALIDOS.has(t.TIPO?.toUpperCase()) && t.SECTOR_GEO !== 'ARG';
        })
        .map((t) => t.ticker.toUpperCase()),
    );
    return [...set].sort();
  }, [tenenciasPorMes]);

  const { eventos, finnhubConfigured, loadingEventos, errorEventos } = useCalendario(tickersActivos);

  const [filtroTicker, setFiltroTicker] = useState<string | null>(null);
  const [filtroTipoEvento, setFiltroTipoEvento] = useState<EventoTipo | null>(null);

  const tickersDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const e of eventos) set.add(e.ticker);
    return [...set].sort();
  }, [eventos]);

  const eventosFiltrados = useMemo(
    () => eventos.filter((e) =>
      (!filtroTicker || e.ticker === filtroTicker) &&
      (!filtroTipoEvento || e.tipo === filtroTipoEvento),
    ),
    [eventos, filtroTicker, filtroTipoEvento],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>

      {tickersDisponibles.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          <Pill label="Todos" active={filtroTicker === null} onClick={() => setFiltroTicker(null)} />
          {tickersDisponibles.map((t) => (
            <Pill key={t} label={t} active={filtroTicker === t} onClick={() => setFiltroTicker((prev) => prev === t ? null : t)} />
          ))}
        </div>
      )}

      {/* ── Próximos eventos ──────────────────────────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--primary)' }}>
            Próximos Eventos (90 días)
          </p>
          {finnhubConfigured && (
            <div style={{ display: 'flex', gap: 4 }}>
              <Pill label="Todos" active={filtroTipoEvento === null} onClick={() => setFiltroTipoEvento(null)} />
              <Pill label="Balances" active={filtroTipoEvento === 'earnings'} color={TIPO_EVENTO_META.earnings.color} onClick={() => setFiltroTipoEvento((p) => p === 'earnings' ? null : 'earnings')} />
              <Pill label="Dividendos" active={filtroTipoEvento === 'dividendo'} color={TIPO_EVENTO_META.dividendo.color} onClick={() => setFiltroTipoEvento((p) => p === 'dividendo' ? null : 'dividendo')} />
            </div>
          )}
        </div>

        {!finnhubConfigured ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            Configurá tu API key gratuita de Finnhub (variable <code>FINNHUB_API_KEY</code>) para ver el calendario de balances y dividendos.{' '}
            <a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Conseguir key gratis</a>.
          </p>
        ) : loadingEventos ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Cargando eventos…</p>
        ) : eventosFiltrados.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Sin eventos próximos para los tickers actuales.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {eventosFiltrados.map((e, i) => {
              const meta = TIPO_EVENTO_META[e.tipo];
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
                  <span style={{ color: 'var(--muted)', minWidth: 80, flexShrink: 0 }}>{fmtFechaEvento(e.fecha)}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 56 }}>{e.ticker}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: meta.color, background: `${meta.color}22`,
                    padding: '2px 8px', borderRadius: 10,
                  }}>{meta.label}</span>
                  {e.detalle && <span style={{ color: 'var(--muted)' }}>{e.detalle}</span>}
                </div>
              );
            })}
          </div>
        )}
        {errorEventos && (
          <p style={{ margin: 0, fontSize: 11, color: '#ef553b' }}>Algunos eventos no pudieron cargarse: {errorEventos}</p>
        )}
      </Card>
    </div>
  );
}
