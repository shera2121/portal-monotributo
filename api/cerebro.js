/**
 * ============================================================================
 * VERCEL SERVERLESS FUNCTION — GR CEREBRO CENTRAL DE IA (/api/cerebro)
 * ============================================================================
 * Motor conversacional consultivo en 3 pasos con autodetección del mejor
 * modelo de chat habilitado en la cuenta de Groq (caché en memoria 10 min):
 *  - Paso 1: Interpretación con Groq (JSON estricto con fallback sin response_format,
 *            timeout seguro, temperature 0): corrige errores de tipeo y extrae
 *            terminosBusqueda + planillasObjetivo.
 *  - Paso 2: Lectura <1s del Índice Unificado de las 7 Planillas + PWA en Drive
 *            (admin_consultar_indice_unificado en Apps Script, 9000 ms).
 *  - Paso 3: Respuesta consultiva con Groq (timeout seguro, temperature 0.2)
 *            citando siempre [Planilla → Hoja] y proponiendo próximos pasos operativos.
 *  - Respaldo seguro: si Groq no está configurado o falla, devuelve directamente
 *            las coincidencias reales del Índice Unificado sin colgar ni devolver 504.
 *
 * Variables de entorno en Vercel:
 *  - GROQ_API_KEY     : API Key de Groq Cloud (prioritaria)
 *  - GROQ_MODEL       : (Opcional) Modelo preferido si está habilitado en la cuenta
 *  - APPS_SCRIPT_URL  : URL /exec de la Web App de Google Apps Script
 *  - GEMINI_API_KEY   : (Opcional, solo para acción diagnóstica list_models)
 */

const GROQ_CHAT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';

const GROQ_MODELS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const TIMEOUT_GROQ_MODELS_MS = 4000;
const TIMEOUT_VERIFY_MS = 7000;
const TIMEOUT_STEP1_GROQ_MS = 5500;
const TIMEOUT_STEP2_INDICE_MS = 9000;
const TIMEOUT_STEP3_GROQ_MS = 11000;
const MAX_GROQ_MODEL_ATTEMPTS = 3;

const REGEX_MODELOS_NO_CHAT =
  /whisper|tts|guard|safeguard|playai|embed|rerank|orpheus|prompt-guard|compound-beta/i;

const FALLBACK_GROQ_CANDIDATES = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant'
];

// Caché en memoria (10 minutos) de modelos habilitados en Groq
const cacheModelosGroq = {
  fetchedAt: 0,
  keyFingerprint: '',
  models: []
};

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
- Devolvé ÚNICAMENTE el objeto JSON puro {...}, sin texto adicional ni bloques markdown.`;

const SYSTEM_STEP3_CONSULTOR = `Sos el Asistente Contable e Impositivo del estudio de Alfredo Germán Read (GR Servicios Contables — Salta, Argentina), operando dentro del módulo privado /admin bajo estricto Nivel 1 (Solo Lectura).

REGLAS OBLIGATORIAS:
1. Respondé en español argentino profesional, claro, estructurado y directo.
2. Basate ÚNICAMENTE en los datos reales recuperados del Índice Unificado provistos en este turno. NUNCA inventes CUITs, montos, períodos, categorías, vencimientos ni estados que no figuren en los datos recuperados.
3. Citá SIEMPRE la fuente exacta entre corchetes usando el formato [Planilla → Hoja] (por ejemplo: [DEV_Registro de Comprobantes → Directorio Clientes], [DEV_Registro de Comprobantes → Solicitudes App PWA], [DEV_Registro de Comprobantes → Base_Conocimiento_IA], [Control de Alertas ARCA → ...]).
4. Si una planilla no tiene ID configurado o no figuran coincidencias para el dato consultado, decilo explícitamente citando los avisos del índice.
5. Al final de tu respuesta, agregá una sección breve **"Próximos pasos sugeridos"** con acciones concretas y útiles para el contador (qué verificar, qué comunicar al cliente o qué regla vigente de Base_Conocimiento_IA aplica).
6. Nunca afirmes haber modificado planillas ni emitido comprobantes (estás en modo consulta Nivel 1).`;

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

function puntuarModeloGroq(modelId, modeloPreferidoEnv) {
  const id = String(modelId || '').trim();
  const lower = id.toLowerCase();

  // Máxima prioridad al modelo configurado explícitamente en process.env.GROQ_MODEL
  if (modeloPreferidoEnv && lower === modeloPreferidoEnv.toLowerCase()) {
    return 10000;
  }

  let score = 10;

  if (lower.includes('120b')) score += 120;
  else if (lower.includes('70b')) score += 105;
  else if (lower.includes('32b')) score += 75;
  else if (lower.includes('20b')) score += 62;
  else if (lower.includes('8b-instant')) score += 50;
  else if (lower.includes('8b')) score += 40;

  if (lower.includes('llama-4')) score += 95;
  if (lower.includes('maverick')) score += 90;
  if (lower.includes('scout')) score += 84;
  if (lower.includes('gpt-oss')) score += 82;
  if (lower.includes('qwen')) score += 78;
  if (lower.includes('deepseek')) score += 74;
  if (lower.includes('llama-3.3')) score += 35;
  if (lower.includes('llama-3.1')) score += 20;
  if (lower.includes('versatile')) score += 12;
  if (lower.includes('instruct')) score += 6;

  return score;
}

function ordenarYFiltrarModelosGroq(rawIds = [], modeloPreferidoEnv = '') {
  const unicos = [];
  const vistos = new Set();

  for (const raw of rawIds) {
    const id = String(raw || '').trim();
    if (!id || vistos.has(id)) continue;
    if (REGEX_MODELOS_NO_CHAT.test(id)) continue;
    vistos.add(id);
    unicos.push(id);
  }

  unicos.sort((a, b) => {
    const diff = puntuarModeloGroq(b, modeloPreferidoEnv) - puntuarModeloGroq(a, modeloPreferidoEnv);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  return unicos;
}

/**
 * Consulta y cachea en memoria (10 minutos) la lista real de modelos de chat
 * habilitados para la GROQ_API_KEY actual.
 */
async function obtenerModelosChatGroqDisponibles(groqApiKey) {
  const modeloPreferidoEnv = String(process.env.GROQ_MODEL || '').trim();
  const keyFingerprint = `${groqApiKey.slice(0, 6)}:${groqApiKey.slice(-4)}:${modeloPreferidoEnv}`;
  const ahora = Date.now();

  if (
    cacheModelosGroq.models.length > 0 &&
    cacheModelosGroq.keyFingerprint === keyFingerprint &&
    ahora - cacheModelosGroq.fetchedAt < GROQ_MODELS_CACHE_TTL_MS
  ) {
    return cacheModelosGroq.models;
  }

  try {
    const resp = await fetchConTimeout(
      GROQ_MODELS_ENDPOINT,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${groqApiKey}`
        }
      },
      TIMEOUT_GROQ_MODELS_MS
    );

    const data = await resp.json().catch(() => ({}));
    if (resp.ok && Array.isArray(data?.data)) {
      const idsActivos = data.data
        .filter((m) => m && m.id && m.active !== false)
        .map((m) => String(m.id).trim());

      const ordenados = ordenarYFiltrarModelosGroq(idsActivos, modeloPreferidoEnv);
      if (ordenados.length > 0) {
        cacheModelosGroq.fetchedAt = ahora;
        cacheModelosGroq.keyFingerprint = keyFingerprint;
        cacheModelosGroq.models = ordenados;
        return ordenados;
      }
    }
  } catch {
    // Si falla la consulta al catálogo, continuar con lista de respaldo ordenada
  }

  const fallbackLista = ordenarYFiltrarModelosGroq(
    [modeloPreferidoEnv, ...FALLBACK_GROQ_CANDIDATES].filter(Boolean),
    modeloPreferidoEnv
  );
  return fallbackLista;
}

function esErrorReintentableConOtroModeloGroq(status, mensaje = '') {
  const msg = String(mensaje || '');
  if (status === 429 || status === 503 || status === 404 || status === 403) return true;
  if (
    /does\s+not\s+exist|do\s+not\s+have\s+access|not\s+found|decommissioned|deprecated|model.*not.*available|rate\s*limit|too\s+many\s+requests|overloaded|capacity/i.test(
      msg
    )
  ) {
    return true;
  }
  return false;
}

function esErrorResponseFormatNoSoportado(status, mensaje = '') {
  if (status !== 400 && status !== 422) return false;
  return /response_format|json_object|json_validate_failed|structured\s+output|failed\s+to\s+generate\s+json/i.test(
    String(mensaje || '')
  );
}

async function ejecutarChatCompletionGroq({
  groqApiKey,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
  usarJsonObject
}) {
  const payload = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages
  };
  if (usarJsonObject) {
    payload.response_format = { type: 'json_object' };
  }

  const resp = await fetchConTimeout(
    GROQ_CHAT_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`
      },
      body: JSON.stringify(payload)
    },
    timeoutMs
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detalle = data?.error?.message || `HTTP ${resp.status}`;
    const err = new Error(detalle);
    err.httpStatus = resp.status;
    throw err;
  }

  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    const errVacio = new Error('Groq devolvió una respuesta vacía.');
    errVacio.httpStatus = 502;
    throw errVacio;
  }

  return content;
}

/**
 * Prueba hasta 3 modelos habilitados de Groq manteniendo un presupuesto de tiempo seguro.
 * Si usarJsonObject está activo y un modelo rechaza response_format, reintenta ese mismo
 * modelo sin response_format pidiendo JSON puro.
 */
async function llamarGroqConRotacion({
  groqApiKey,
  modelosCandidatos,
  messages,
  temperature,
  maxTokens,
  timeoutTotalMs,
  usarJsonObject = false
}) {
  const lista = Array.isArray(modelosCandidatos)
    ? modelosCandidatos.slice(0, MAX_GROQ_MODEL_ATTEMPTS)
    : [];
  if (lista.length === 0) {
    throw new Error('No hay modelos de chat disponibles en Groq.');
  }

  const inicio = Date.now();
  let ultimoError = null;

  for (let i = 0; i < lista.length; i++) {
    const modelo = lista[i];
    const restante = timeoutTotalMs - (Date.now() - inicio);
    if (restante < 1200) break;

    const timeoutIntento = Math.max(1500, Math.min(restante, Math.ceil(timeoutTotalMs * 0.78)));

    try {
      const content = await ejecutarChatCompletionGroq({
        groqApiKey,
        model: modelo,
        messages,
        temperature,
        maxTokens,
        timeoutMs: timeoutIntento,
        usarJsonObject
      });
      return { content, modelUsed: modelo };
    } catch (err) {
      ultimoError = err;

      // Paso 1: si falló por no soportar response_format: json_object, reintentar sin response_format
      if (usarJsonObject && esErrorResponseFormatNoSoportado(err.httpStatus, err.message)) {
        const restanteSinRf = timeoutTotalMs - (Date.now() - inicio);
        if (restanteSinRf >= 1200) {
          try {
            const mensajesJsonPuro = [
              ...messages.slice(0, -1),
              {
                role: 'user',
                content: `${messages[messages.length - 1].content}\n\nIMPORTANTE: Respondé ÚNICAMENTE con un objeto JSON válido comenzando con { y terminando con }. Sin explicaciones.`
              }
            ];
            const contentPuro = await ejecutarChatCompletionGroq({
              groqApiKey,
              model: modelo,
              messages: mensajesJsonPuro,
              temperature,
              maxTokens,
              timeoutMs: Math.max(1500, restanteSinRf),
              usarJsonObject: false
            });
            return { content: contentPuro, modelUsed: modelo };
          } catch (errSinRf) {
            ultimoError = errSinRf;
          }
        }
      }

      if (esErrorReintentableConOtroModeloGroq(err.httpStatus, err.message) || err.isTimeout) {
        continue;
      }

      // Error fatal no ligado al modelo (ej. 401 API key inválida)
      if (err.httpStatus === 401) {
        throw new Error(`API Key de Groq inválida o rechazada: ${err.message}`);
      }
      continue;
    }
  }

  throw ultimoError || new Error('Ningún modelo de Groq pudo completar la solicitud a tiempo.');
}

function extraerObjetoJsonSeguro(textoRaw) {
  let limpio = String(textoRaw || '').trim();
  limpio = limpio.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = limpio.match(/\{[\s\S]*\}/);
  if (match) limpio = match[0];
  return JSON.parse(limpio);
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
 * Paso 1: Interpretación rápida con Groq (JSON estricto con fallback sin response_format)
 */
async function paso1InterpretarConGroq(groqApiKey, modelosCandidatos, message, historialReciente) {
  const resumenHist = historialReciente
    .slice(-4)
    .map((m) => `${m.role === 'assistant' ? 'Asistente' : 'Admin'}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const userPrompt = resumenHist
    ? `Historial reciente:\n${resumenHist}\n\nConsulta actual del contador:\n${message}`
    : `Consulta del contador:\n${message}`;

  const { content, modelUsed } = await llamarGroqConRotacion({
    groqApiKey,
    modelosCandidatos,
    temperature: 0,
    maxTokens: 320,
    timeoutTotalMs: TIMEOUT_STEP1_GROQ_MS,
    usarJsonObject: true,
    messages: [
      { role: 'system', content: SYSTEM_STEP1_INTERPRETER },
      { role: 'user', content: userPrompt }
    ]
  });

  const parsed = extraerObjetoJsonSeguro(content);

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
    planillasObjetivo: planillasObjetivo.length > 0 ? planillasObjetivo : ['todas'],
    modelUsed
  };
}

/**
 * Paso 3: Respuesta consultiva con Groq (temperature 0.2, rotación automática hasta 3 modelos)
 */
async function paso3ResponderConGroq(
  groqApiKey,
  modelosCandidatos,
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

  return llamarGroqConRotacion({
    groqApiKey,
    modelosCandidatos,
    temperature: 0.2,
    maxTokens: 1800,
    timeoutTotalMs: TIMEOUT_STEP3_GROQ_MS,
    usarJsonObject: false,
    messages
  });
}

function construirRespuestaRespaldoIndice(datosIndice, motivo) {
  const lineas = [];
  lineas.push(
    `**Consulta directa sobre el Índice Unificado (Actualizado: ${datosIndice.actualizadoEn || 'S/D'})**`
  );
  if (motivo) {
    lineas.push(
      `_Aviso: ${motivo}. Se muestran directamente las coincidencias reales encontradas en las planillas:_`
    );
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido. Usá POST.' });
  }

  const groqApiKey = String(process.env.GROQ_API_KEY || '').trim();
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

  // Diagnóstico autenticado de modelos Groq habilitados
  if (action === 'list_models') {
    if (!groqApiKey) {
      return res.status(400).json({ ok: false, error: 'Falta GROQ_API_KEY en Vercel.' });
    }
    const modelos = await obtenerModelosChatGroqDisponibles(groqApiKey);
    return res.status(200).json({
      ok: true,
      action: 'list_models',
      provider: 'groq',
      preferredEnvModel: String(process.env.GROQ_MODEL || '').trim() || null,
      totalChatModels: modelos.length,
      chatModelsOrdered: modelos
    });
  }

  // Obtener lista priorizada de modelos de chat reales habilitados en la cuenta de Groq (caché 10 min)
  let modelosGroq = [];
  if (groqApiKey) {
    modelosGroq = await obtenerModelosChatGroqDisponibles(groqApiKey);
  }

  // ==========================================================================
  // PASO 1: INTERPRETACIÓN CON GROQ (JSON con fallback sin response_format)
  // ==========================================================================
  let interpretacion = interpretarConsultaLocal(message);
  let paso1ConGroq = false;
  let modeloPaso1 = '';

  if (groqApiKey && modelosGroq.length > 0) {
    try {
      const resP1 = await paso1InterpretarConGroq(
        groqApiKey,
        modelosGroq,
        message,
        historialReciente
      );
      interpretacion = resP1;
      modeloPaso1 = resP1.modelUsed || '';
      paso1ConGroq = true;
    } catch {
      interpretacion = interpretarConsultaLocal(message);
    }
  }

  // Si Paso 1 ya encontró un modelo funcionando en esta cuenta, priorizarlo primero para Paso 3
  const modelosParaPaso3 = modeloPaso1
    ? [modeloPaso1, ...modelosGroq.filter((m) => m !== modeloPaso1)]
    : modelosGroq;

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
  // PASO 3: RESPUESTA CONSULTIVA CON GROQ (auto-rotación hasta 3 modelos)
  // ==========================================================================
  if (groqApiKey && modelosParaPaso3.length > 0) {
    try {
      const { content: replyGroq, modelUsed } = await paso3ResponderConGroq(
        groqApiKey,
        modelosParaPaso3,
        interpretacion.consultaCorregida || message,
        historialReciente,
        datosIndice
      );

      return res.status(200).json({
        ok: true,
        reply: replyGroq,
        toolsUsed,
        model: modelUsed,
        primaryModel: modelosGroq[0] || modelUsed,
        usedFallback: false,
        paso1ConGroq,
        indiceActualizadoEn: datosIndice.actualizadoEn || '',
        modelStatusMessage: `Groq (${modelUsed}) • Índice Unificado`,
        timestamp: new Date().toISOString()
      });
    } catch (errGroq3) {
      const replyDirecto = construirRespuestaRespaldoIndice(
        datosIndice,
        `Groq no pudo responder (${errGroq3?.message || 'sin modelos disponibles'})`
      );
      return res.status(200).json({
        ok: true,
        reply: replyDirecto,
        toolsUsed,
        model: 'indice-unificado-directo',
        primaryModel: modelosGroq[0] || 'groq',
        usedFallback: true,
        indiceActualizadoEn: datosIndice.actualizadoEn || '',
        modelStatusMessage: 'Índice Unificado directo • Nivel 1 (Respaldo sin IA)',
        timestamp: new Date().toISOString()
      });
    }
  }

  const replySinGroq = construirRespuestaRespaldoIndice(
    datosIndice,
    'GROQ_API_KEY no configurada en Vercel'
  );
  return res.status(200).json({
    ok: true,
    reply: replySinGroq,
    toolsUsed,
    model: 'indice-unificado-directo',
    primaryModel: 'groq',
    usedFallback: true,
    indiceActualizadoEn: datosIndice.actualizadoEn || '',
    modelStatusMessage: 'Índice Unificado directo • Nivel 1 (Falta GROQ_API_KEY)',
    timestamp: new Date().toISOString()
  });
}
