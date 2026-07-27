import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DashboardData, EventoCalendario } from '@/types';

const fetchCalendarioFinancieroMock = vi.fn();

vi.mock('./calendario', () => ({
  fetchCalendarioFinanciero: (...args: unknown[]) => fetchCalendarioFinancieroMock(...args),
}));

// Import dinámico después del mock para que vitest lo intercepte correctamente.
const { calcularAlertaSemanal, armarContenidoMail, enviarAlertaSemanal } = await import('./alertas');

function dataConTenencia(ticker: string, tenenciaUsd: number, extra: Partial<DashboardData['tenenciasPorMes'][string][number]> = {}): DashboardData {
  return {
    kpis: {} as DashboardData['kpis'],
    resumenSeries: [],
    tenenciasPorMes: {
      '2026-07': [
        {
          ticker,
          tenencia_ars: 0,
          tenencia_usd: tenenciaUsd,
          fechaTs: Date.UTC(2026, 6, 1),
          fechaMes: '2026-07',
          TIPO: 'ACCION',
          RIESGO: 3,
          SECTOR_GEO: 'USA',
          RENTA: 'Variable',
          MONEDA: 'USD',
          ...extra,
        },
      ],
    },
    mesesDisponibles: ['Jul-2026'],
    totalPorMes: { '2026-07': tenenciaUsd },
    totalPorMesArs: { '2026-07': 0 },
  };
}

beforeEach(() => {
  fetchCalendarioFinancieroMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 6, 27)); // 2026-07-27, lunes
});

afterEach(() => {
  vi.useRealTimers();
});

describe('calcularAlertaSemanal', () => {
  it('pide el calendario para el rango [hoy, hoy+7d] con los tickers de la cartera', async () => {
    fetchCalendarioFinancieroMock.mockResolvedValue({ eventos: [], yields: [], errores: [], generatedAt: Date.now() });

    const data = dataConTenencia('AAPL', 1000);
    await calcularAlertaSemanal(data, 7);

    expect(fetchCalendarioFinancieroMock).toHaveBeenCalledWith(
      ['AAPL'],
      [],
      '2026-07-27',
      '2026-08-03',
      { AAPL: 1000 },
    );
  });

  it('suma solo los montos en USD para el total estimado', async () => {
    const eventos: EventoCalendario[] = [
      { ticker: 'AAPL', tipo: 'dividendo', fecha: '2026-07-28', montoEstimado: 10, monedaMonto: 'USD' },
      { ticker: 'GD30', tipo: 'renta', fecha: '2026-07-29', montoEstimado: 5000, monedaMonto: 'ARS' },
      { ticker: 'MSFT', tipo: 'earnings', fecha: '2026-07-30' }, // sin monto
    ];
    fetchCalendarioFinancieroMock.mockResolvedValue({ eventos, yields: [], errores: [], generatedAt: Date.now() });

    const data = dataConTenencia('AAPL', 1000);
    const alerta = await calcularAlertaSemanal(data, 7);

    expect(alerta.totalUsdEstimado).toBe(10);
    expect(alerta.eventos).toHaveLength(3);
  });

  it('usa el último mes disponible cuando hay varios', async () => {
    fetchCalendarioFinancieroMock.mockResolvedValue({ eventos: [], yields: [], errores: [], generatedAt: Date.now() });

    const data = dataConTenencia('AAPL', 1000);
    data.tenenciasPorMes['2026-06'] = [
      { ticker: 'VIEJO', tenencia_ars: 0, tenencia_usd: 999, fechaTs: 0, fechaMes: '2026-06', TIPO: 'ACCION', RIESGO: 1, SECTOR_GEO: 'USA', RENTA: 'Variable', MONEDA: 'USD' },
    ];

    await calcularAlertaSemanal(data, 7);

    // Solo el ticker del mes más reciente (2026-07), no "VIEJO" de 2026-06.
    expect(fetchCalendarioFinancieroMock).toHaveBeenCalledWith(
      ['AAPL'], [], '2026-07-27', '2026-08-03', { AAPL: 1000 },
    );
  });
});

describe('armarContenidoMail', () => {
  it('arma un mensaje distinto cuando no hay eventos', () => {
    const { asunto, texto } = armarContenidoMail({ desde: '2026-07-27', hasta: '2026-08-03', eventos: [], totalUsdEstimado: 0 });
    expect(asunto).toContain('sin cobros');
    expect(texto).toContain('No hay dividendos');
  });

  it('incluye cada evento y el total en el texto plano', () => {
    const eventos: EventoCalendario[] = [
      { ticker: 'AAPL', tipo: 'dividendo', fecha: '2026-07-28', montoEstimado: 12.5, monedaMonto: 'USD' },
    ];
    const { asunto, texto, html } = armarContenidoMail({ desde: '2026-07-27', hasta: '2026-08-03', eventos, totalUsdEstimado: 12.5 });

    expect(asunto).toContain('1 evento');
    expect(asunto).toContain('12.50');
    expect(texto).toContain('AAPL');
    expect(texto).toContain('Dividendo');
    expect(html).toContain('AAPL');
    expect(html).toContain('<table');
  });

  it('pluraliza "eventos" cuando hay más de uno', () => {
    const eventos: EventoCalendario[] = [
      { ticker: 'AAPL', tipo: 'dividendo', fecha: '2026-07-28' },
      { ticker: 'MSFT', tipo: 'earnings', fecha: '2026-07-29' },
    ];
    const { asunto } = armarContenidoMail({ desde: '2026-07-27', hasta: '2026-08-03', eventos, totalUsdEstimado: 0 });
    expect(asunto).toContain('2 eventos');
  });
});

describe('enviarAlertaSemanal', () => {
  const alertaVacia = { desde: '2026-07-27', hasta: '2026-08-03', eventos: [], totalUsdEstimado: 0 };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.RESEND_API_KEY = 'test-key';
    delete process.env.RESEND_FROM;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it('tira error claro si falta RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(enviarAlertaSemanal('x@example.com', alertaVacia)).rejects.toThrow('RESEND_API_KEY');
  });

  it('llama a la API de Resend con el remitente sandbox por defecto', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await enviarAlertaSemanal('nicolasmenna10@gmail.com', alertaVacia);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.from).toBe('onboarding@resend.dev');
    expect(body.to).toEqual(['nicolasmenna10@gmail.com']);
    expect(body.subject).toContain('sin cobros');
  });

  it('usa RESEND_FROM si está configurado', async () => {
    process.env.RESEND_FROM = 'Portfolio <alertas@midominio.com>';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await enviarAlertaSemanal('nicolasmenna10@gmail.com', alertaVacia);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.from).toBe('Portfolio <alertas@midominio.com>');
  });

  it('propaga un error legible si Resend responde con error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{"message":"invalid to"}',
    });

    await expect(enviarAlertaSemanal('x@example.com', alertaVacia)).rejects.toThrow(/Resend: HTTP 422/);
  });
});
