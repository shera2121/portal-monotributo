/**
 * ============================================================================
 * VERCEL SERVERLESS FUNCTION — GR CEREBRO CENTRAL DE IA (/api/cerebro)
 * ============================================================================
 * Motor conversacional consultivo en 3 pasos (sin tool_calling frágil ni 504):
 *  - Paso 1: Interpretación con Groq (llama-3.3-70b-versatile, JSON estricto, 5000 ms, temp 0)
 *            corrige errores de tipeo y extrae terminosBusqueda + planillasObjetivo.
 *  - Paso 2: Lectura <1s del Índice Unificado de las 7 Planillas + PWA en Drive
 *            (admin_consultar_indice_unificado en Apps Script, 9000 ms).
 *  - Paso 3: Respuesta consultiva con Groq (10000 ms, temp 0.2) citando siempre
 *            [Planilla → Hoja] y proponiendo próximos pasos operativos concretos.
 *  - Respaldo seguro: si Groq no está configurado o falla, devuelve directamente
 *            las coincidencias reales del Índice Unificado sin colgar ni devolver 504.
 *
 * Variables de entorno en Vercel:
 *  - GROQ_API_KEY     : API Key de Groq Cloud (prioritaria)
 *  - GROQ_MODEL       : (Opcional) por defecto "llama-3.3-70b-versatile"
 *  - APPS_SCRIPT_URL  : URL /exec de la Web App de Google Apps Script
 *  - GEMINI_API_KEY   : (Opcional, solo para acción diagnóstica list_models)
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

const TIMEOUT_VERIFY_MS = 7000;
const TIMEOUT_STEP1_GROQ_MS = 5000;
const TIMEOUT_STEP2_INDICE_MS = 9000;
const TIMEOUT_STEP3_GROQ_MS = 10000;

const SYSTEM_STEP1_INTERPRETER = `Sos el clasificador de consultas del estudio contable GR Servicios Contables (Argentina).
Tu única tarea es devolver un objeto JSON válido con exactamente estas 3 claves:
{
  "consultaCorregida": "pregunta del usuario corrigiendo errores de tipeo evidentes (ej. 'jjorge lopez' -> 'jorge lopez')",
  "terminosBusqueda": ["array de 1 a 6 términos clave limpios: nombres, apellidos, CUITs sin guiones, impuestos o conceptos clave"],
  "planillasObjetivo": ["subconjunto de: 'todas', 'pwa', 'comprobantes', 'ganancias', 'maestro', 'vencimientos', 'alertas', 'cm', 'errepar'"]
}

Reglas estrictas:
- Si la pregunta es de seguimiento (ej. "¿y sus honorarios?" o "¿cuál es su CUIT?"), usá el historial reciente para incluir el nombre o CUIT del cliente referido en "terminosBusqueda".
- Si la consulta menciona VEP, honorarios, monotributo, clientes, facturas o normativa del estudio, incluí ["pwa", "comprobantes"].
- Si menciona ganancias o autónomos, incluí ["ganancias"].
- Si menciona convenio multilateral, CM03, CM05 o DGR, incluí ["cm"].
- Si menciona Errepar o retenciones de 4ta categoría, incluí ["errepar"].
- Si menciona vencimientos o alertas ARCA, incluí ["vencimientos", "alertas"].
- Si busca un cliente por nombre/CUIT o no está claro en qué libro está el dato, usá ["todas"].
- Devolvé ÚNICAMENTE JSON válido, sin explicaciones.`;

const SYSTEM_STEP3_CONSULTOR = `Sos el Asistente Contable e Impositivo del estudio de Alfredo Germán Read (GR Servicios Contables — Salta, Argentina), operando dentro del módulo privado /admin bajo estricto Nivel 1 (Solo Lectura).

REGLAS OBLIGATORIAS:
1. Respondé en español argentino profesional, claro, estructurado y directo.
2. Basate ÚNICAMENTE en los datos reales recuperados del Índice Unificado provistos en este turno. NUNCA inventes CUITs, montos, períodos, categorías, vencimientos ni estados que no figuren en los datos recuperados.
3. Citá SIEMPRE la fuente exacta entre corchetes usando el formato [Planilla → Hoja] (por ejemplo: [DEV_Registro de Comprobantes → Directorio Clientes], [DEV_Registro de Comprobantes → Solicitudes App PWA], [DEV_Registro de Comprobantes → Base_Conocimiento_IA], [Control de Alertas ARCA → ...]).
4. Si una planilla no tiene ID configurado o no figuran coincidencias para el dato consultado, decilo explícitamente citando los avisos del índice.
5. Al final de tu respuesta, agregá una sección breve **"Próximos pasos sugeridos"** con acciones concretas y útiles para el contador (qué verificar, qué comunicar al cliente o qué regla vigente de Base_Conocimiento_IA aplica).
6. Nunca afirmes haber modificado planillas ni emitido comprobantes (estás en modo consulta Nivel 1).`;

function obtenerModeloGroq() {
  return String(process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL;
}

function normalizarTexto(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function fetchConTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`Tiempo de espera agotado (${timeoutMs} ms)`);
      timeoutErr.isTimeout = true;
      timeoutErr.httpStatus = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function llamarAppsScriptAdmin(appsScriptUrl, action, payload, timeoutMs = TIMEOUT_STEP2_INDICE_MS) {
  const resp = await fetchConTimeout(
    appsScriptUrl,
    {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    },
    timeoutMs
  );

  const texto = await resp.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error(`Apps Script respondió en formato no JSON (HTTP ${resp.status}).`);
  }
  return json;
}

function normalizarHistorialReciente(historyRaw, maxMensajes = 6) {
  if (!Array.isArray(historyRaw)) return [];
  return historyRaw
    .slice(-maxMensajes)
    .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text.trim().slice(0, 1800)
    }));
}

function interpretarConsultaLocal(message) {
  const norm = normalizarTexto(message);
  const planillas = [];

  if (/ganancia|autonom/.test(norm)) planillas.push('ganancias');
  if (/convenio|cm03|cm05|\bcm\b|dgr/.test(norm)) planillas.push('cm');
  if (/errepar|4ta|cuarta|retencion/.test(norm)) planillas.push('errepar');
  if (/vencim/.test(norm)) planillas.push('vencimientos');
  if (/alerta|arca/.test(norm)) planillas.push('alertas');
  if (/maestro/.test(norm)) planillas.push('maestro');
  if (/vep|honorario|monotrib|pwa|solicitud|normativ|regla|criterio/.test(norm)) {
    planillas.push('pwa', 'comprobantes');
  }

  const stop = new Set([
    'cual', 'cuales', 'es', 'son', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'al', 'a',
    'en', 'por', 'para', 'con', 'que', 'como', 'quien', 'cuit', 'cuil', 'dni', 'cliente', 'clientes',
    'buscar', 'buscame', 'mostrame', 'revisa', 'datos', 'estado', 'tienen', 'tiene', 'hola', 'favor'
  ]);

  const digitos = String(message || '').match(/\b\d{2}-?\d{8}-?\d\b|\b\d{7,11}\b/g) || [];
  const palabras = norm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stop.has(w));

  const terminosBusqueda = Array.from(
    new Set([
      ...digitos.map((d) => d.replace(/\D/g, '')),
      ...palabras
    ])
  ).slice(0, 6);

  return {
    consultaCorregida: String(message || '').trim(),
    terminosBusqueda,
    planillasObjetivo: planillas.length > 0 ? Array.from(new Set(planillas)) : ['todas']
  };
}

/**
 * Paso 1: Interpretación rápida con Groq (JSON estricto, 5000 ms, temperature 0)
 */
async function paso1InterpretarConGroq(groqApiKey, groqModel, message, historialReciente) {
  const resumenHist = historialReciente
    .slice(-4)
    .map((m) => `${m.role === 'assistant' ? 'Asistente' : 'Admin'}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const userPrompt = resumenHist
    ? `Historial reciente:\n${resumenHist}\n\nConsulta actual del contador:\n${message}`
    : `Consulta del contador:\n${message}`;

  const resp = await fetchConTimeout(
    GROQ_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: groqModel,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_STEP1_INTERPRETER },
          { role: 'user', content: userPrompt }
        ]
      })
    },
    TIMEOUT_STEP1_GROQ_MS
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Groq Paso 1 HTTP ${resp.status}`);
  }

  const rawText = String(data?.choices?.[0]?.message?.content || '').trim();
  const parsed = JSON.parse(rawText);

  const consultaCorregida = String(parsed.consultaCorregida || message).trim();
  const terminosBusqueda = Array.isArray(parsed.terminosBusqueda)
    ? parsed.terminosBusqueda.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const planillasObjetivo = Array.isArray(parsed.planillasObjetivo)
    ? parsed.planillasObjetivo.map((p) => String(p || '').trim().toLowerCase()).filter(Boolean)
    : ['todas'];

  return {
    consultaCorregida,
    terminosBusqueda,
    planillasObjetivo: planillasObjetivo.length > 0 ? planillasObjetivo : ['todas']
  };
}

/**
 * Paso 3: Respuesta consultiva con Groq (10000 ms, temperature 0.2)
 */
async function paso3ResponderConGroq(
  groqApiKey,
  groqModel,
  consultaCorregida,
  historialReciente,
  datosIndice
) {
  const messages = [
    { role: 'system', content: SYSTEM_STEP3_CONSULTOR },
    ...historialReciente,
    {
      role: 'user',
      content: `CONSULTA DEL CONTADOR:\n${consultaCorregida}\n\nDATOS REALES RECUPERADOS DEL ÍNDICE UNIFICADO:\n${datosIndice.contextoCompacto || 'Sin datos disponibles.'}`
    }
  ];

  const resp = await fetchConTimeout(
    GROQ_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: groqModel,
        temperature: 0.2,
        max_tokens: 1800,
        messages
      })
    },
    TIMEOUT_STEP3_GROQ_MS
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Groq Paso 3 HTTP ${resp.status}`);
  }

  const texto = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!texto) throw new Error('Groq devolvió una respuesta vacía.');
  return texto;
}

function construirRespuestaRespaldoIndice(datosIndice, motivo) {
  const lineas = [];
  lineas.push(
    `**Consulta directa sobre el Índice Unificado (Actualizado: ${datosIndice.actualizadoEn || 'S/D'})**`
  );
  if (motivo) {
    lineas.push(`_Aviso: ${motivo}. Se muestran directamente las coincidencias reales encontradas en las planillas:_`);
  }

  const coincidencias = Array.isArray(datosIndice.coincidencias) ? datosIndice.coincidencias : [];
  if (coincidencias.length > 0) {
    lineas.push('');
    lineas.push(`**Coincidencias encontradas (${datosIndice.totalCoincidencias || coincidencias.length}):**`);
    coincidencias.forEach((c) => lineas.push(`- ${c}`));
  } else {
    lineas.push('');
    lineas.push('- No se encontraron coincidencias exactas en el Índice Unificado para esa búsqueda.');
  }

  const avisos = Array.isArray(datosIndice.avisos) ? datosIndice.avisos : [];
  if (avisos.length > 0) {
    lineas.push('');
    lineas.push('**Avisos de planillas:**');
    avisos.forEach((a) => lineas.push(`- ${a}`));
  }

  return lineas.join('\n');
}

async function listarModelosDisponiblesGemini(geminiApiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiApiKey)}`;
  const resp = await fetchConTimeout(url, { method: 'GET' }, 6000);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  }
  const models = (Array.isArray(data?.models) ? data.models : []).map((m) => ({
    id: String(m?.name || '').replace(/^models\//, ''),
    displayName: String(m?.displayName || ''),
    supportedGenerationMethods: Array.isArray(m?.supportedGenerationMethods)
      ? m.supportedGenerationMethods
      : []
  }));
  return {
    ok: true,
    action: 'list_models',
    totalModels: models.length,
    generateContentModels: models
      .filter((m) => m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => m.id),
    models
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

  const groqApiKey = String(process.env.GROQ_API_KEY || '').trim();
  const geminiApiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const appsScriptUrl = String(process.env.APPS_SCRIPT_URL || '').trim();

  if (!appsScriptUrl || !appsScriptUrl.startsWith('https://script.google.com/')) {
    return res.status(500).json({
      ok: false,
      error: 'Falta configurar APPS_SCRIPT_URL (URL /exec válida de Google Apps Script) en Vercel.'
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

  const action = String(body.action || '').trim().toLowerCase();
  const message = String(body.message || '').trim();
  const sessionToken = String(body.sessionToken || '').trim();
  const historialReciente = normalizarHistorialReciente(body.history, 6);

  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Sesión expirada' });
  }
  if (action !== 'list_models' && !message) {
    return res.status(400).json({ ok: false, error: 'Escribí una consulta antes de enviar.' });
  }

  // Verificar sessionToken contra Apps Script ANTES de procesar
  try {
    const verif = await llamarAppsScriptAdmin(
      appsScriptUrl,
      'admin_verify_session',
      { sessionToken },
      TIMEOUT_VERIFY_MS
    );
    if (!verif || verif.ok !== true || verif.valid !== true) {
      return res.status(401).json({ ok: false, error: 'Sesión expirada' });
    }
  } catch (errVerif) {
    return res.status(502).json({
      ok: false,
      error: `No se pudo verificar la sesión de administrador: ${errVerif.message}`
    });
  }

  if (action === 'list_models') {
    if (!geminiApiKey) {
      return res.status(400).json({ ok: false, error: 'Falta GEMINI_API_KEY en Vercel.' });
    }
    try {
      return res.status(200).json(await listarModelosDisponiblesGemini(geminiApiKey));
    } catch (eList) {
      return res.status(502).json({ ok: false, error: eList?.message || 'Error consultando modelos.' });
    }
  }

  const groqModel = obtenerModeloGroq();

  // ==========================================================================
  // PASO 1: INTERPRETACIÓN CON GROQ (JSON estricto, 5000 ms, temp 0)
  // ==========================================================================
  let interpretacion = interpretarConsultaLocal(message);
  let paso1ConGroq = false;

  if (groqApiKey) {
    try {
      interpretacion = await paso1InterpretarConGroq(
        groqApiKey,
        groqModel,
        message,
        historialReciente
      );
      paso1ConGroq = true;
    } catch {
      // Continuar sin demora con interpretación local
      interpretacion = interpretarConsultaLocal(message);
    }
  }

  // ==========================================================================
  // PASO 2: LECTURA DEL ÍNDICE UNIFICADO EN DRIVE (<1s, timeout 9000 ms)
  // ==========================================================================
  let datosIndice = null;
  try {
    datosIndice = await llamarAppsScriptAdmin(
      appsScriptUrl,
      'admin_consultar_indice_unificado',
      {
        sessionToken,
        planillasObjetivo: interpretacion.planillasObjetivo,
        terminosBusqueda: interpretacion.terminosBusqueda,
        consultaOriginal: interpretacion.consultaCorregida || message
      },
      TIMEOUT_STEP2_INDICE_MS
    );

    if (
      datosIndice &&
      datosIndice.ok === false &&
      /sesi[oó]n\s+expirada/i.test(datosIndice.error || '')
    ) {
      return res.status(401).json({ ok: false, error: 'Sesión expirada' });
    }
    if (!datosIndice || datosIndice.ok !== true) {
      throw new Error(datosIndice?.error || 'No se pudo leer el Índice Unificado.');
    }
  } catch (errIndice) {
    return res.status(502).json({
      ok: false,
      error: `Error consultando el Índice Unificado de las 7 Planillas: ${errIndice?.message}`
    });
  }

  const toolsUsed = [
    {
      name: 'indice_unificado_7_planillas',
      args: {
        planillasObjetivo: interpretacion.planillasObjetivo,
        terminosBusqueda: interpretacion.terminosBusqueda
      },
      ok: true,
      fuentes: Array.isArray(datosIndice.fuentesConsultadas)
        ? datosIndice.fuentesConsultadas
        : ['Índice Unificado (7 Planillas + PWA)'],
      avisos: Array.isArray(datosIndice.avisos) ? datosIndice.avisos : []
    }
  ];

  // ==========================================================================
  // PASO 3: RESPUESTA CONSULTIVA CON GROQ (10000 ms, temp 0.2) + RESPALDO SEGURO
  // ==========================================================================
  if (groqApiKey) {
    try {
      const replyGroq = await paso3ResponderConGroq(
        groqApiKey,
        groqModel,
        interpretacion.consultaCorregida || message,
        historialReciente,
        datosIndice
      );

      return res.status(200).json({
        ok: true,
        reply: replyGroq,
        toolsUsed,
        model: groqModel,
        primaryModel: groqModel,
        usedFallback: false,
        paso1ConGroq,
        indiceActualizadoEn: datosIndice.actualizadoEn || '',
        modelStatusMessage: 'Groq Llama 3.3 70B • Índice Unificado (7 Planillas + PWA)',
        timestamp: new Date().toISOString()
      });
    } catch (errGroq3) {
      const replyDirecto = construirRespuestaRespaldoIndice(
        datosIndice,
        `Groq no respondió a tiempo (${errGroq3?.message || 'timeout'})`
      );
      return res.status(200).json({
        ok: true,
        reply: replyDirecto,
        toolsUsed,
        model: 'indice-unificado-directo',
        primaryModel: groqModel,
        usedFallback: true,
        indiceActualizadoEn: datosIndice.actualizadoEn || '',
        modelStatusMessage: 'Índice Unificado directo • Nivel 1 (Respaldo sin IA)',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Sin GROQ_API_KEY configurada: responder directamente desde el Índice Unificado sin 504
  const replySinGroq = construirRespuestaRespaldoIndice(
    datosIndice,
    'GROQ_API_KEY no configurada en Vercel'
  );
  return res.status(200).json({
    ok: true,
    reply: replySinGroq,
    toolsUsed,
    model: 'indice-unificado-directo',
    primaryModel: groqModel,
    usedFallback: true,
    indiceActualizadoEn: datosIndice.actualizadoEn || '',
    modelStatusMessage: 'Índice Unificado directo • Nivel 1 (Falta GROQ_API_KEY)',
    timestamp: new Date().toISOString()
  });
}
