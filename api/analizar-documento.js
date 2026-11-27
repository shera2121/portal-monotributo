/**
 * ============================================================================
 * VERCEL SERVERLESS FUNCTION — VALIDADOR DOCUMENTAL OCR/PDF (/api/analizar-documento)
 * ============================================================================
 * Etapa 4: Inteligencia Documental de Nivel 1 (Solo Lectura) para el módulo /admin.
 * Recibe PDF, JPG, PNG o WEBP en base64, extrae campos estructurados con
 * gemini-3.8-flash y cruza automáticamente contra Apps Script (admin_cruzar_documento)
 * sin modificar ninguna celda ni emitir comprobantes.
 */

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const RETRY_DELAY_MS = 800;

const MIME_PERMITIDOS = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const PROMPT_EXTRACCION_JSON = `Sos el motor OCR contable de GR Servicios Contables (Argentina).
Analizá el documento adjunto (VEP, comprobante de pago, factura, recibo, constancia ARCA o ticket) y devolvé ÚNICAMENTE un objeto JSON estricto, sin texto adicional ni explicaciones, con exactamente estas 8 claves:
{
  "tipo_documento": "string breve (ej: VEP Monotributo, Comprobante Pago VEP, Factura C, Recibo Honorarios, Constancia ARCA, Transferencia Bancaria)",
  "cuit": "CUIT principal del contribuyente en formato 11 dígitos sin guiones si es legible, o cadena vacía",
  "nombre_razon_social": "Nombre y apellido o razón social legible, o cadena vacía",
  "fecha": "Fecha del documento en formato DD/MM/YYYY si es legible, o cadena vacía",
  "periodo": "Período fiscal o mes imputado (ej: 2026-11 o 11/2026) si figura, o cadena vacía",
  "importe_total": 0,
  "numero_comprobante_cae": "Número de comprobante, N° de VEP, N° de operación o CAE si figura, o cadena vacía",
  "observaciones": "Resumen breve y técnico de cualquier dato relevante (red de pago, banco, impuesto, alertas de legibilidad)"
}
Reglas:
- "importe_total" debe ser número decimal (ej: 45800.50) o 0 si no figura importe.
- NO inventes ningún dato que no sea claramente visible en el archivo.`;

function obtenerModeloGemini() {
  return String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esErrorSobrecarga(status, mensaje = '') {
  return (
    status === 503 ||
    status === 429 ||
    /high\s+demand|overloaded|unavailable|rate\s*limit|too\s+many\s+requests|resource_exhausted|quota/i.test(
      String(mensaje || '')
    )
  );
}

async function llamarAppsScriptAdmin(appsScriptUrl, action, payload) {
  const resp = await fetch(appsScriptUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Apps Script respondió en formato no JSON (HTTP ${resp.status}).`);
  }
}

async function extraerDocumentoConGemini(geminiApiKey, geminiModel, mimeType, base64Clean) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  let ultimoError = null;

  for (let intento = 1; intento <= 2; intento++) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: PROMPT_EXTRACCION_JSON },
              {
                inlineData: {
                  mimeType,
                  data: base64Clean
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      })
    });

    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const rawText = parts
        .filter((p) => typeof p?.text === 'string')
        .map((p) => p.text)
        .join('\n')
        .trim();
      return rawText;
    }

    const detalle = data?.error?.message || `HTTP ${resp.status}`;
    ultimoError = new Error(`Error en Gemini API (${geminiModel}): ${detalle}`);
    ultimoError.httpStatus = resp.status;

    if (esErrorSobrecarga(resp.status, detalle) && intento === 1) {
      await esperar(RETRY_DELAY_MS);
      continue;
    }
    throw ultimoError;
  }

  throw ultimoError || new Error('No se pudo analizar el documento con Gemini.');
}

function parsearJsonEstricto(rawText) {
  let limpio = String(rawText || '').trim();
  limpio = limpio.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const matchLlaves = limpio.match(/\{[\s\S]*\}/);
  if (matchLlaves) limpio = matchLlaves[0];

  const obj = JSON.parse(limpio);
  const importeNum = Number(
    typeof obj.importe_total === 'number'
      ? obj.importe_total
      : String(obj.importe_total || '0')
          .replace(/[^\d.,-]/g, '')
          .replace(/\.(?=\d{3}(?:\D|$))/g, '')
          .replace(',', '.')
  );

  return {
    tipo_documento: String(obj.tipo_documento || '').trim() || 'Documento sin clasificar',
    cuit: String(obj.cuit || '').replace(/\D/g, '').slice(0, 11),
    nombre_razon_social: String(obj.nombre_razon_social || '').trim(),
    fecha: String(obj.fecha || '').trim(),
    periodo: String(obj.periodo || '').trim(),
    importe_total: Number.isFinite(importeNum) ? Math.round(importeNum * 100) / 100 : 0,
    numero_comprobante_cae: String(obj.numero_comprobante_cae || '').trim(),
    observaciones: String(obj.observaciones || '').trim()
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido. Usá POST.' });
  }

  const geminiApiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const appsScriptUrl = String(process.env.APPS_SCRIPT_URL || '').trim();

  if (!geminiApiKey) {
    return res.status(500).json({
      ok: false,
      error: 'Falta configurar GEMINI_API_KEY en las Variables de Entorno de Vercel.'
    });
  }
  if (!appsScriptUrl || !appsScriptUrl.startsWith('https://script.google.com/')) {
    return res.status(500).json({
      ok: false,
      error: 'Falta configurar APPS_SCRIPT_URL en las Variables de Entorno de Vercel.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'Cuerpo JSON inválido.' });
    }
  }
  body = body || {};

  const sessionToken = String(body.sessionToken || '').trim();
  const fileName = String(body.fileName || 'documento').trim();
  let mimeType = String(body.mimeType || '').trim().toLowerCase();
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

  const rawBase64 = String(body.fileBase64 || '').trim();
  const base64Clean = rawBase64.includes(',') ? rawBase64.split(',').pop().trim() : rawBase64;

  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Sesión expirada' });
  }
  if (!base64Clean) {
    return res.status(400).json({ ok: false, error: 'Falta el contenido del archivo (fileBase64).' });
  }
  if (!MIME_PERMITIDOS.has(mimeType)) {
    return res.status(400).json({
      ok: false,
      error: 'Tipo de archivo no soportado. Subí un PDF, JPG, PNG o WEBP.'
    });
  }

  // 1. Verificar sessionToken contra Apps Script ANTES de llamar a Gemini
  try {
    const verif = await llamarAppsScriptAdmin(appsScriptUrl, 'admin_verify_session', {
      sessionToken
    });
    if (!verif || verif.ok !== true || verif.valid !== true) {
      return res.status(401).json({ ok: false, error: 'Sesión expirada' });
    }
  } catch (errVerif) {
    return res.status(502).json({
      ok: false,
      error: `No se pudo verificar la sesión de administrador: ${errVerif.message}`
    });
  }

  // 2. Extraer datos estructurados con Gemini 3.8 Flash
  const geminiModel = obtenerModeloGemini();
  let datosExtraidos = null;
  try {
    const rawJsonText = await extraerDocumentoConGemini(
      geminiApiKey,
      geminiModel,
      mimeType,
      base64Clean
    );
    datosExtraidos = parsearJsonEstricto(rawJsonText);
  } catch (errGemini) {
    const status = errGemini?.httpStatus === 503 || errGemini?.httpStatus === 429 ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: errGemini?.message || 'No se pudo extraer información del documento.'
    });
  }

  // 3. Si se detectó CUIT, importe o nombre, cruzar automáticamente en Nivel 1 con Apps Script
  let crucePlanillas = null;
  let avisoCruce = '';

  if (
    datosExtraidos.cuit ||
    datosExtraidos.importe_total > 0 ||
    datosExtraidos.nombre_razon_social
  ) {
    try {
      const resCruce = await llamarAppsScriptAdmin(appsScriptUrl, 'admin_cruzar_documento', {
        sessionToken,
        cuit: datosExtraidos.cuit,
        importe: datosExtraidos.importe_total,
        periodo: datosExtraidos.periodo,
        tipoDocumento: datosExtraidos.tipo_documento,
        nombreRazonSocial: datosExtraidos.nombre_razon_social
      });
      if (resCruce && resCruce.ok === false && /sesi[oó]n\s+expirada/i.test(resCruce.error || '')) {
        return res.status(401).json({ ok: false, error: 'Sesión expirada' });
      }
      crucePlanillas = resCruce;
    } catch (errCruce) {
      avisoCruce = `El documento se leyó correctamente, pero falló el cruce con Apps Script: ${errCruce.message}`;
    }
  } else {
    avisoCruce =
      'No se detectó CUIT ni importe suficiente para ejecutar el cruce automático contra las planillas.';
  }

  return res.status(200).json({
    ok: true,
    fileName,
    mimeType,
    model: geminiModel,
    datosExtraidos,
    crucePlanillas,
    avisoCruce,
    timestamp: new Date().toISOString()
  });
}
