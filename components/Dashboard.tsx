'use client';

import { useState, useEffect, useMemo } from 'react';
import type { DashboardData, TenenciaActual } from '@/types';
import { fmtUSD, fmtPct } from '@/lib/parser';
import { RIESGO_LABEL, RENTA_LABEL, GEO_LABEL, MONEDA_LABEL } from '@/lib/constants';
import KPICard from './KPICard';
import EvolucionChart from './EvolucionChart';
import TreemapChart from './TreemapChart';
import EvolucionTipoChart from './EvolucionTipoChart';
import MonthSlider from './MonthSlider';
import UploadTenencias from './UploadTenencias';
type Tab = 'resumen' | 'tenencias';

const DIMS_TENENCIAS = [
  { key: 'TIPO',       label: 'Tipo de Activo'    },
  { key: 'RIESGO',     label: 'Nivel de Riesgo'   },
  { key: 'MONEDA',     label: 'Tipo de Moneda'    },
  { key: 'RENTA',      label: 'Tipo de Renta'     },
  { key: 'SECTOR_GEO', label: 'Sector Geográfico' },
] as const;
type DimTenencias = typeof DIMS_TENENCIAS[number]['key'];

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen',   label: 'Resumen'   },
  { id: 'tenencias', label: 'Tenencias' },
];

// ── Filtro activo pill ────────────────────────────────────────────────────────

function FiltroPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 10px 3px 12px',
      borderRadius: 20,
      background: 'var(--primary-dim)',
      border: '1px solid var(--primary)',
      fontSize: 11, color: 'var(--primary)', fontWeight: 600,
    }}>
      {label}
      <button
        onClick={onClear}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--primary)', fontSize: 13, lineHeight: 1,
          padding: '0 0 0 2px', display: 'flex', alignItems: 'center',
        }}
      >×</button>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { data: DashboardData }

export default function Dashboard({ data }: Props) {
  const { kpis, resumenSeries, tenenciasPorMes, mesesDisponibles, totalPorMes } = data;

  const [tab, setTab]               = useState<Tab>('resumen');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [mesSel, setMesSel]         = useState(mesesDisponibles[mesesDisponibles.length - 1] ?? '');
  const [theme, setTheme]           = useState<'dark' | 'light'>('dark');
  const [hideValues, setHideValues] = useState(false);
  const [dimTenencias, setDimTenencias] = useState<DimTenencias>('TIPO');

  // Filtros cross-chart
  const [filtroTipo,   setFiltroTipo]   = useState<string | null>(null);
  const [filtroRiesgo, setFiltroRiesgo] = useState<string | null>(null);
  const [filtroMoneda, setFiltroMoneda] = useState<string | null>(null);
  const [filtroRenta,  setFiltroRenta]  = useState<string | null>(null);
  const [filtroGeo,    setFiltroGeo]    = useState<string | null>(null);

  const hayFiltro = filtroTipo || filtroRiesgo || filtroMoneda || filtroRenta || filtroGeo;

  function clearFiltros() {
    setFiltroTipo(null); setFiltroRiesgo(null); setFiltroMoneda(null);
    setFiltroRenta(null); setFiltroGeo(null);
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  }, [theme]);

  const mesKey = (() => {
    const idx = mesesDisponibles.indexOf(mesSel);
    const sorted = Object.keys(tenenciasPorMes).sort();
    return sorted[idx] ?? sorted[sorted.length - 1] ?? '';
  })();

  const tenenciasMesRaw: TenenciaActual[] = tenenciasPorMes[mesKey] ?? [];
  const totalMes = totalPorMes[mesKey] ?? kpis.totalCartera;

  const tenenciasMes = useMemo(() => {
    let items = tenenciasMesRaw;
    if (filtroTipo)   items = items.filter(t => t.TIPO === filtroTipo);
    if (filtroRiesgo) items = items.filter(t => (RIESGO_LABEL[t.RIESGO] ?? 'Sin dato') === filtroRiesgo);
    if (filtroMoneda) items = items.filter(t => (MONEDA_LABEL[t.MONEDA] ?? t.MONEDA) === filtroMoneda);
    if (filtroRenta)  items = items.filter(t => (RENTA_LABEL[t.RENTA] ?? t.RENTA) === filtroRenta);
    if (filtroGeo)    items = items.filter(t => (GEO_LABEL[t.SECTOR_GEO] ?? t.SECTOR_GEO) === filtroGeo);
    return items;
  }, [tenenciasMesRaw, filtroTipo, filtroRiesgo, filtroMoneda, filtroRenta, filtroGeo]);

  const deltaColor = kpis.deltaCartera >= 0 ? 'var(--up)' : 'var(--down)';
  const rendColor  = kpis.rendimientoNeto >= 0 ? 'var(--up)' : 'var(--down)';
  const tirColor   = kpis.tirAnual == null ? 'var(--muted)' : kpis.tirAnual >= 0 ? 'var(--up)' : 'var(--down)';

  return (
    <main style={{
      maxWidth: 1280,
      margin: '0 auto',
      padding: '14px 24px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      height: '100vh',
    }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        paddingBottom: 16,
        borderBottom: '1px solid var(--border)',
        marginBottom: 0,
      }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 4 }}>
            Portfolio · Finanzas Personales
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1, margin: 0 }}>
            Investment Dashboard
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Al{' '}
            <span style={{ color: 'var(--text-sec)', fontWeight: 500 }}>{kpis.fechaStr}</span>
          </p>
          <button
            className="theme-toggle"
            onClick={() => setHideValues(v => !v)}
            title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
          >
            {hideValues ? (
              <><span style={{ fontSize: 14 }}>👁</span>Mostrar</>
            ) : (
              <><span style={{ fontSize: 14 }}>🙈</span>Ocultar</>
            )}
          </button>
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title="Cambiar tema"
          >
            {theme === 'dark' ? (
              <><span style={{ fontSize: 14 }}>☀</span>Claro</>
            ) : (
              <><span style={{ fontSize: 14 }}>☾</span>Oscuro</>
            )}
          </button>
          <button
            className="theme-toggle"
            onClick={() => setUploadOpen(true)}
            title="Cargar datos"
          >
            <><span style={{ fontSize: 14 }}>⬆</span>Cargar</>
          </button>
        </div>
      </header>

      {/* ── Modal: Cargar Datos ──────────────────────────────────────────────── */}
      {uploadOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setUploadOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 100,
            }}
          />
          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 520, maxWidth: '95vw',
            background: 'var(--bg)',
            borderLeft: '1px solid var(--border)',
            zIndex: 101,
            display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
          }}>
            {/* Panel header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--primary)', margin: 0 }}>
                  Actualizar datos
                </p>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '2px 0 0' }}>
                  Cargar Datos
                </p>
              </div>
              <button
                onClick={() => setUploadOpen(false)}
                style={{
                  background: 'none', border: '1px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer',
                  color: 'var(--muted)', fontSize: 18, lineHeight: 1,
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            </div>
            {/* Panel body — scrolleable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <UploadTenencias />
            </div>
          </div>
        </>
      )}

      {/* ── Nav tabs ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 16,
        padding: '8px 0 0',
        borderBottom: '1px solid var(--border)',
        marginBottom: 14,
      }}>
        <nav style={{ display: 'flex', gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '7px 18px',
                borderRadius: '8px 8px 0 0',
                fontSize: 13,
                fontWeight: tab === t.id ? 700 : 500,
                cursor: 'pointer',
                border: '1px solid',
                borderBottom: tab === t.id ? '1px solid var(--card)' : '1px solid transparent',
                borderColor: tab === t.id ? 'var(--border)' : 'transparent',
                background: tab === t.id ? 'var(--card)' : 'transparent',
                color: tab === t.id ? 'var(--primary)' : 'var(--muted)',
                marginBottom: tab === t.id ? -1 : 0,
                transition: 'all 0.12s',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab: Resumen ────────────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <KPICard
              label="Total Cartera"
              value={hideValues ? '***' : fmtUSD(kpis.totalCartera)}
              sub={hideValues ? '***' : `${kpis.deltaCartera >= 0 ? '▲' : '▼'} ${fmtUSD(Math.abs(kpis.deltaCartera))} vs mes anterior`}
              subColor={deltaColor}
              accentColor="var(--primary)"
            />
            <KPICard
              label="Rendimiento Neto"
              value={hideValues ? '***' : fmtUSD(kpis.rendimientoNeto)}
              sub={hideValues ? '***' : `${fmtPct(kpis.rendimientoPct)} sobre aportes`}
              subColor={rendColor}
              accentColor={rendColor}
            />
            <KPICard
              label="TIR Anual"
              value={kpis.tirAnual != null ? `${kpis.tirAnual.toFixed(1)}%` : 'N/D'}
              sub="sobre flujos históricos"
              subColor={tirColor}
              accentColor={tirColor}
            />
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <EvolucionChart
              data={resumenSeries}
              tenenciasPorMes={tenenciasPorMes}
              hideValues={hideValues}
            />
          </div>
        </section>
      )}

      {/* ── Tab: Tenencias ──────────────────────────────────────────────────── */}
      {tab === 'tenencias' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>

          {/* Barra de controles: selector de mes centrado + dimensión + filtros activos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>

            {/* Botón Último a la izquierda */}
            {mesesDisponibles.indexOf(mesSel) < mesesDisponibles.length - 1 && (
              <button
                onClick={() => setMesSel(mesesDisponibles[mesesDisponibles.length - 1])}
                style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid var(--primary)',
                  background: 'var(--primary-dim)', color: 'var(--primary)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >‹ Último</button>
            )}

            {/* MonthSlider centrado */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <MonthSlider
                meses={mesesDisponibles}
                selected={mesSel}
                onSelect={setMesSel}
                totalMes={totalMes}
                activosMes={tenenciasMes.length}
                hideValues={hideValues}
              />
            </div>

            {/* Separador */}
            <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

            {/* Selector de dimensión unificado */}
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flexShrink: 0 }}>
              {DIMS_TENENCIAS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setDimTenencias(d.key)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                    cursor: 'pointer', border: '1px solid',
                    borderColor: dimTenencias === d.key ? 'var(--primary)' : 'var(--border)',
                    background: dimTenencias === d.key ? 'var(--primary-dim)' : 'transparent',
                    color: dimTenencias === d.key ? 'var(--primary)' : 'var(--muted)',
                    transition: 'all 0.12s', whiteSpace: 'nowrap',
                  }}
                >{d.label}</button>
              ))}
            </div>

            {/* Filtros activos */}
            {hayFiltro && (
              <>
                <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
                {filtroTipo   && <FiltroPill label={filtroTipo}   onClear={() => setFiltroTipo(null)} />}
                {filtroRiesgo && <FiltroPill label={filtroRiesgo} onClear={() => setFiltroRiesgo(null)} />}
                {filtroMoneda && <FiltroPill label={filtroMoneda} onClear={() => setFiltroMoneda(null)} />}
                {filtroRenta  && <FiltroPill label={filtroRenta}  onClear={() => setFiltroRenta(null)} />}
                {filtroGeo    && <FiltroPill label={filtroGeo}    onClear={() => setFiltroGeo(null)} />}
                <button
                  onClick={clearFiltros}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted)', textDecoration: 'underline' }}
                >Limpiar</button>
              </>
            )}
          </div>

          {/* Treemap + Evolución por — mismo tamaño */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
            <TreemapChart
              tenencias={tenenciasMes}
              totalCartera={totalMes}
              dim={dimTenencias}
              filtroTipo={filtroTipo}
              onFiltroTipo={(t) => setFiltroTipo(prev => prev === t ? null : t)}
              hideValues={hideValues}
            />
            <EvolucionTipoChart
              tenenciasPorMes={tenenciasPorMes}
              mesesDisponibles={mesesDisponibles}
              dim={dimTenencias}
              mesSel={mesSel}
              onMesClick={(fecha) => { if (mesesDisponibles.includes(fecha)) setMesSel(fecha); }}
              hideValues={hideValues}
            />
          </div>
        </section>
      )}


    </main>
  );
}
