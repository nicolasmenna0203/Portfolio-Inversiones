// Alerta semanal por mail: qué cobros de dividendos, renta, amortización y
// balances caen en los próximos 7 días para la cartera actual.
//
// El envío usa la API HTTP de Resend directamente (fetch, sin el paquete
// `resend`) siguiendo la misma convención que el resto de lib/ (Yahoo,
// bonistas.com) de no sumar SDKs para un solo POST.

import type { DashboardData, EventoCalendario } from '@/types';
import { fetchCalendarioFinanciero } from './calendario';
import { tickersDeCartera } from './tickersElegibles';

const TIPO_LABEL: Record<EventoCalendario['tipo'], string> = {
  dividendo: 'Dividendo',
  'dividendo-fut': 'Dividendo (confirmado)',
  earnings: 'Balance',
  renta: 'Renta',
  amortizacion: 'Amortización',
};

export interface AlertaSemanal {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  eventos: EventoCalendario[];
  /** Suma de montoEstimado en USD (ignora eventos sin monto o en otra moneda). */
  totalUsdEstimado: number;
}

function fmtFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Calcula los eventos de calendario financiero de la cartera actual que caen
 * en los próximos `dias` días (por defecto 7, desde hoy inclusive).
 */
export async function calcularAlertaSemanal(
  data: DashboardData,
  dias = 7,
): Promise<AlertaSemanal> {
  const meses = Object.keys(data.tenenciasPorMes).sort();
  const ultimoMes = meses[meses.length - 1];
  const items = data.tenenciasPorMes[ultimoMes] ?? [];
  const { tickersUsa, tickersArg, tenencias } = tickersDeCartera(items);

  const hoy = new Date();
  const desde = fmtFecha(hoy);
  const hastaDate = new Date(hoy);
  hastaDate.setUTCDate(hastaDate.getUTCDate() + dias);
  const hasta = fmtFecha(hastaDate);

  // El rango puede cruzar fin de año (ej. 28-dic a 4-ene); fetchCalendarioFinanciero
  // no asume año calendario, así que pasar desde/hasta directo alcanza.
  const { eventos } = await fetchCalendarioFinanciero(tickersUsa, tickersArg, desde, hasta, tenencias);

  const totalUsdEstimado = eventos.reduce((s, e) => {
    if (e.montoEstimado != null && (e.monedaMonto ?? 'USD') === 'USD') return s + e.montoEstimado;
    return s;
  }, 0);

  return { desde, hasta, eventos, totalUsdEstimado };
}

function fmtFechaLegible(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00Z');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function fmtMonto(monto: number, moneda = 'USD'): string {
  const simbolo = moneda === 'ARS' ? '$' : 'US$';
  return `≈ ${simbolo} ${monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Asunto + cuerpo (texto plano y HTML) del mail, listos para pasarle a cualquier proveedor. */
export function armarContenidoMail(alerta: AlertaSemanal): { asunto: string; texto: string; html: string } {
  const { eventos, totalUsdEstimado } = alerta;

  if (eventos.length === 0) {
    return {
      asunto: 'Portfolio — sin cobros esta semana',
      texto: `No hay dividendos, renta, amortización ni balances programados entre ${alerta.desde} y ${alerta.hasta}.`,
      html: `<p>No hay dividendos, renta, amortización ni balances programados entre ${alerta.desde} y ${alerta.hasta}.</p>`,
    };
  }

  const filas = eventos.map((e) => {
    const monto = e.montoEstimado != null ? fmtMonto(e.montoEstimado, e.monedaMonto) : '—';
    return { fecha: fmtFechaLegible(e.fecha), ticker: e.ticker, tipo: TIPO_LABEL[e.tipo], detalle: e.detalle ?? '', monto };
  });

  const asunto = `Portfolio — ${eventos.length} evento${eventos.length === 1 ? '' : 's'} esta semana (≈ US$ ${totalUsdEstimado.toFixed(2)})`;

  const texto = [
    `Eventos entre ${alerta.desde} y ${alerta.hasta}:`,
    '',
    ...filas.map((f) => `${f.fecha}  ${f.ticker.padEnd(8)}  ${f.tipo.padEnd(24)}  ${f.monto}`),
    '',
    `Total estimado: ≈ US$ ${totalUsdEstimado.toFixed(2)}`,
  ].join('\n');

  const html = `
    <h2 style="font-family:sans-serif">Cobros de la semana</h2>
    <p style="font-family:sans-serif;color:#555">${alerta.desde} → ${alerta.hasta}</p>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <thead>
        <tr style="text-align:left;border-bottom:1px solid #ddd">
          <th style="padding:6px 12px">Fecha</th>
          <th style="padding:6px 12px">Ticker</th>
          <th style="padding:6px 12px">Tipo</th>
          <th style="padding:6px 12px">Detalle</th>
          <th style="padding:6px 12px">Monto</th>
        </tr>
      </thead>
      <tbody>
        ${filas.map((f) => `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:6px 12px">${f.fecha}</td>
          <td style="padding:6px 12px"><b>${f.ticker}</b></td>
          <td style="padding:6px 12px">${f.tipo}</td>
          <td style="padding:6px 12px;color:#777">${f.detalle}</td>
          <td style="padding:6px 12px">${f.monto}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-family:sans-serif;margin-top:16px"><b>Total estimado: ≈ US$ ${totalUsdEstimado.toFixed(2)}</b></p>
  `.trim();

  return { asunto, texto, html };
}

// Remitente por defecto de Resend cuando no hay dominio propio verificado.
// Solo puede mandar al mismo mail con el que te registraste en Resend.
const REMITENTE_DEFAULT = 'onboarding@resend.dev';

/**
 * Envía la alerta semanal por mail vía la API de Resend.
 * Requiere RESEND_API_KEY. Opcionalmente RESEND_FROM si se verificó un
 * dominio propio en Resend (si no, se usa el remitente sandbox de Resend,
 * que solo entrega al mail con el que te registraste ahí).
 */
export async function enviarAlertaSemanal(destinatario: string, alerta: AlertaSemanal): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY no configurada.');
  }

  const { asunto, html, texto } = armarContenidoMail(alerta);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || REMITENTE_DEFAULT,
      to: [destinatario],
      subject: asunto,
      html,
      text: texto,
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Resend: HTTP ${res.status} ${detalle}`);
  }
}
