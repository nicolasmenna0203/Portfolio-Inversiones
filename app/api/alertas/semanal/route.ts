import { NextRequest, NextResponse } from 'next/server';
import { fetchDashboardData } from '@/lib/sheets';
import { calcularAlertaSemanal, armarContenidoMail, enviarAlertaSemanal } from '@/lib/alertas';
import { equalsSeguro } from '@/lib/timingSafe';

export const runtime = 'nodejs';

// Destino fijo: dashboard de un solo usuario. Si en algún momento hay más de
// un destinatario, esto pasa a ser una lista en variable de entorno.
const DESTINATARIO = 'nicolasmenna10@gmail.com';

/**
 * Dispara la alerta semanal de cobros (dividendos, renta, amortización,
 * balances) de los próximos 7 días.
 *
 * Pensada para invocarse desde un cron externo (Vercel Cron u otro), no desde
 * el browser — por eso no usa la cookie de sesión sino un secret propio
 * (CRON_SECRET) pasado como `Authorization: Bearer <secret>`.
 *
 * Envío por Resend (RESEND_API_KEY). Falta programar el trigger: Vercel Cron
 * en plan Hobby corre como mínimo una vez al día (no soporta "cada lunes a
 * las 8am" con precisión horaria), así que la alternativa más simple es un
 * cron diario que solo actúe los lunes (chequeando el día de la semana acá
 * adentro), o un servicio externo de cron gratuito (cron-job.org, GitHub
 * Actions schedule) que sí permita el horario exacto.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!equalsSeguro(token, secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const data = await fetchDashboardData();
    const alerta = await calcularAlertaSemanal(data, 7);
    const contenido = armarContenidoMail(alerta);

    await enviarAlertaSemanal(DESTINATARIO, alerta);

    return NextResponse.json({ ok: true, ...contenido, eventos: alerta.eventos.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
