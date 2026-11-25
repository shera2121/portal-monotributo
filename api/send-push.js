import crypto from 'node:crypto';
import * as webpushModule from 'web-push';

const webpush = webpushModule.default || webpushModule;

/**
 * ============================================================================
 * VERCEL SERVERLESS FUNCTION — ENVÍO DE WEB PUSH 24/7 (/api/send-push)
 * ============================================================================
 * Permite que Google Apps Script dispare notificaciones Push nativas a los
 * celulares Android/iOS de los clientes aunque la PC del estudio esté apagada.
 *
 * Variables de entorno requeridas en Vercel (Settings -> Environment Variables):
 *  - PUSH_API_SECRET   : Secreto compartido validado contra header `x-push-secret`
 *  - VAPID_PUBLIC_KEY  : Clave pública VAPID
 *  - VAPID_PRIVATE_KEY : Clave privada VAPID (solo en servidor, nunca en frontend)
 *  - VAPID_SUBJECT     : mailto:gr.servicioscontable@gmail.com (opcional)
 */

const DEFAULT_VAPID_PUBLIC_KEY =
  'BBGt5g6phAgGSygPsGTpoCDXMAUiRMuTCafeArvobXmQOBErdtG6OcpClUQO_2boH493GT0tmT6Z4ECgATejogA';
const DEFAULT_VAPID_SUBJECT = 'mailto:gr.servicioscontable@gmail.com';

function validarSecretoConstante(recibido, esperado) {
  if (!recibido || !esperado) return false;
  const bufA = Buffer.from(String(recibido).trim(), 'utf8');
  const bufB = Buffer.from(String(esperado).trim(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizarSuscripcion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const endpoint = String(raw.endpoint || '').trim();
  const p256dh = String(raw.keys?.p256dh || raw.p256dh || '').trim();
  const auth = String(raw.keys?.auth || raw.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    keys: { p256dh, auth }
  };
}

export default async function handler(req, res) {
  // Cabeceras básicas de seguridad y CORS para llamadas server-to-server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-push-secret');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido. Usá POST.' });
  }

  // 1. Validar header x-push-secret contra process.env.PUSH_API_SECRET
  const expectedSecret = process.env.PUSH_API_SECRET || '';
  if (!expectedSecret) {
    return res.status(500).json({
      ok: false,
      error: 'Falta configurar la variable de entorno PUSH_API_SECRET en Vercel.'
    });
  }

  const providedSecret = req.headers['x-push-secret'] || '';
  if (!validarSecretoConstante(providedSecret, expectedSecret)) {
    return res.status(401).json({
      ok: false,
      error: 'No autorizado: header x-push-secret inválido o ausente.'
    });
  }

  // 2. Validar configuración VAPID en el servidor
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
  const vapidSubject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

  if (!vapidPrivateKey) {
    return res.status(500).json({
      ok: false,
      error: 'Falta configurar VAPID_PRIVATE_KEY en las Variables de Entorno de Vercel.'
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // 3. Parsear cuerpo JSON (compatible con Apps Script UrlFetchApp)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'El cuerpo JSON es inválido.' });
    }
  }
  body = body || {};

  // Acepta 1 suscripción (`subscription` o campos raíz) o un array (`subscriptions`)
  const listaBruta = Array.isArray(body.subscriptions)
    ? body.subscriptions
    : body.subscription
      ? [body.subscription]
      : [body];

  const suscripciones = listaBruta.map(normalizarSuscripcion).filter(Boolean);

  if (suscripciones.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'Falta una suscripción Push válida (endpoint, keys.p256dh y keys.auth).'
    });
  }

  // 4. Armar payload de notificación con sonido, vibración y enlace directo al PDF
  const pdfUrl = String(
    body.pdfUrl || body.url || body.data?.pdfUrl || body.data?.url || '/?seccion=documentos'
  ).trim();

  const notificationPayload = JSON.stringify({
    title: String(body.title || body.titulo || 'GR Estudio Impositivo Digital'),
    body: String(
      body.body ||
        body.mensaje ||
        body.cuerpo ||
        'Tu comprobante PDF ya está disponible para descargar.'
    ),
    icon: body.icon || '/icons/icon-192.png',
    badge: body.badge || '/icons/icon-192.png',
    tag: String(body.tag || `gr-doc-${Date.now()}`),
    url: pdfUrl,
    pdfUrl,
    data: {
      ...(body.data && typeof body.data === 'object' ? body.data : {}),
      url: pdfUrl,
      pdfUrl
    }
  });

  // 5. Enviar notificación con prioridad alta para despertar Android con sonido y vibración
  const resultados = await Promise.all(
    suscripciones.map(async (sub) => {
      try {
        const resp = await webpush.sendNotification(sub, notificationPayload, {
          TTL: 86400,
          urgency: 'high'
        });
        return {
          endpoint: sub.endpoint,
          ok: true,
          statusCode: resp.statusCode
        };
      } catch (err) {
        const statusCode = err?.statusCode || 500;
        return {
          endpoint: sub.endpoint,
          ok: false,
          statusCode,
          expired: statusCode === 404 || statusCode === 410,
          error: err?.body || err?.message || 'Error enviando notificación Push'
        };
      }
    })
  );

  const sent = resultados.filter((r) => r.ok).length;
  const failed = resultados.length - sent;
  const expiredEndpoints = resultados.filter((r) => r.expired).map((r) => r.endpoint);

  return res.status(sent > 0 ? 200 : 502).json({
    ok: sent > 0,
    sent,
    failed,
    expiredEndpoints,
    results: resultados
  });
}
