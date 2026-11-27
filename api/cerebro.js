/**
 * ============================================================================
 * VERCEL SERVERLESS FUNCTION — GR CEREBRO CENTRAL DE IA (/api/cerebro)
 * ============================================================================
 * Etapa 3: Motor Gemini API (gemini-2.5-flash) con Function Calling estricto
 * de Nivel 1 (Solo Lectura) para el módulo /admin.
 *
 * Variables de entorno requeridas en Vercel (Settings -> Environment Variables):
 *  - GEMINI_API_KEY   : API Key de Google AI Studio / Gemini API
 *  - APPS_SCRIPT_URL  : URL /exec de la Web App de Google Apps Script del estudio
 *
 * Seguridad:
 *  - Verifica sessionToken contra Apps Script (admin_verify_session) ANTES de
 *    invocar a Gemini.
 *  - Nunca hardcodea claves ni expone GEMINI_API_KEY al navegador.
 *  - Solo expone las 4 herramientas de Nivel 1 (Solo Lectura).
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOOL_ROUNDS = 5;

const SYSTEM_INSTRUCTION = `Sos el asistente técnico de inteligencia y control de GR Servicios Contables (Estudio del Contador Público Germán Read, Salta, Argentina), operando en el módulo privado /admin bajo estricto Nivel 1 (Solo Lectura).

REGLAS OBLIGATORIAS E INQUEBRANTABLES:
1. Basate EXCLUSIVAMENTE en los datos reales devueltos por las herramientas ejecutadas en esta conversación.
2. NUNCA inventes datos fiscales, CUITs, montos, categorías, vencimientos, alertas ni estados de pago. Si no tenés el dato verificado por una herramienta, decilo explícitamente.
3. Citá SIEMPRE la planilla y hoja de origen de cada dato (por ejemplo: "DEV_Registro de Comprobantes → Directorio Clientes", "Solicitudes App PWA", "Control Honorarios", "Control Pagos VEP", "Control de Vencimientos", "Control de Alertas ARCA" o "Excel Maestro").
4. Si una herramienta devuelve avisos indicando que falta configurar el ID de una planilla (por ejemplo SHEET_ID_VENCIMIENTOS, SHEET_ID_ALERTAS_ARCA o SHEET_ID_MAESTRO), informalo claramente al contador sin asumir ni completar datos faltantes.
5. Cuando el contador consulte sobre clientes, VEPs, honorarios, vencimientos o alertas ARCA, invocá primero las herramientas correspondientes antes de responder.
6. Respondé en español rioplatense profesional, claro, directo y estructurado (viñetas cortas, totales claros e importes en pesos argentinos cuando los devuelva la herramienta).
7. Estás en Etapa 3 — Nivel 1 (Solo Lectura): si te piden modificar una planilla, emitir una factura, enviar un VEP o mandar un mensaje a un cliente, explicá que todavía no tenés permisos de escritura/acción habilitados y ofrecé el diagnóstico de solo lectura.`;

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'buscar_cliente',
        description:
          'Busca un contribuyente/cliente en "Directorio Clientes" (y en "Excel Maestro" si está configurado) por CUIT sin guiones o por parte del nombre/razón social. Devuelve categoría, cuota Monotributo, estado mes actual VEP, estado de honorarios, modalidad ARCA y semáforo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description:
                'CUIT (con o sin guiones) o parte del nombre / razón social del cliente a buscar.'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'consultar_veps',
        description:
          'Consulta VEPs en "Solicitudes App PWA", "Control Pagos VEP" y estado mensual de VEP en "Directorio Clientes", filtrando opcionalmente por estado y/o cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            estado: {
              type: 'STRING',
              description:
                'Filtro de estado: "Solicitado", "Pendiente", "Enviado", "Pagado", "Verificar" o "Todos". Usá "Pendiente" para detectar VEPs pendientes de envío o revisión.'
            },
            cliente: {
              type: 'STRING',
              description: 'Opcional: nombre o CUIT de un cliente específico para acotar el resultado.'
            }
          }
        }
      },
      {
        name: 'consultar_honorarios',
        description:
          'Consulta el estado de honorarios mensuales en "Directorio Clientes" y los últimos pagos registrados en "Control Honorarios", permitiendo filtrar por Pendiente, Vencido, Pagado o Todos.',
        parameters: {
          type: 'OBJECT',
          properties: {
            estado: {
              type: 'STRING',
              description:
                'Filtro de estado de honorarios: "Pendiente", "Vencido", "Pagado" o "Todos".'
            },
            cliente: {
              type: 'STRING',
              description: 'Opcional: nombre o CUIT de un cliente específico.'
            }
          }
        }
      },
      {
        name: 'consultar_vencimientos_y_alertas',
        description:
          'Lee las hojas principales de "Control de Vencimientos" (SHEET_ID_VENCIMIENTOS) y "Control de Alertas ARCA" (SHEET_ID_ALERTAS_ARCA) devolviendo próximos vencimientos y últimas alertas registradas.',
        parameters: {
          type: 'OBJECT',
          properties: {
            tipo: {
              type: 'STRING',
              description:
                'Qué consultar: "todos" (vencimientos + alertas), "vencimientos" o "alertas".'
            },
            limite: {
              type: 'INTEGER',
              description: 'Cantidad máxima de registros a traer por libro (por defecto 20, máximo 40).'
            }
          }
        }
      }
    ]
  }
];

const MAPA_ACCIONES_APPS_SCRIPT = {
  buscar_cliente: 'admin_buscar_cliente',
  consultar_veps: 'admin_consultar_veps',
  consultar_honorarios: 'admin_consultar_honorarios',
  consultar_vencimientos_y_alertas: 'admin_consultar_vencimientos_alertas'
};

async function llamarAppsScriptAdmin(appsScriptUrl, action, payload) {
  const resp = await fetch(appsScriptUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });

  const texto = await resp.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error(`Apps Script respondió en formato no JSON (HTTP ${resp.status}).`);
  }
  return json;
}

async function llamarGemini(geminiApiKey, contents) {
  const resp = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiApiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents,
      tools: GEMINI_TOOLS,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detalle = data?.error?.message || `HTTP ${resp.status}`;
    throw new Error(`Error en Gemini API: ${detalle}`);
  }
  return data;
}

function normalizarHistorialParaGemini(historyRaw) {
  if (!Array.isArray(historyRaw)) return [];
  return historyRaw
    .slice(-10)
    .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text.trim().slice(0, 3000) }]
    }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido. Usá POST.' });
  }

  // 1. Validar variables de entorno requeridas en Vercel
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
      error: 'Falta configurar APPS_SCRIPT_URL (URL /exec válida de Google Apps Script) en Vercel.'
    });
  }

  // 2. Parsear body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'Cuerpo JSON inválido.' });
    }
  }
  body = body || {};

  const message = String(body.message || '').trim();
  const sessionToken = String(body.sessionToken || '').trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Sesión expirada' });
  }
  if (!message) {
    return res.status(400).json({ ok: false, error: 'Escribí una consulta antes de enviar.' });
  }

  // 3. Verificar sessionToken contra Google Apps Script ANTES de llamar a Gemini
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

  // 4. Bucle de conversación con Gemini 2.5 Flash + Function Calling (Nivel 1)
  const contents = [
    ...normalizarHistorialParaGemini(history),
    { role: 'user', parts: [{ text: message }] }
  ];

  const toolsUsed = [];

  try {
    let respuestaFinal = '';

    for (let ronda = 0; ronda < MAX_TOOL_ROUNDS; ronda++) {
      const geminiData = await llamarGemini(geminiApiKey, contents);
      const candidate = geminiData?.candidates?.[0];
      const modelContent = candidate?.content;
      const parts = Array.isArray(modelContent?.parts) ? modelContent.parts : [];

      const functionCalls = parts
        .filter((p) => p && p.functionCall && p.functionCall.name)
        .map((p) => p.functionCall);

      if (functionCalls.length === 0) {
        respuestaFinal = parts
          .filter((p) => typeof p?.text === 'string')
          .map((p) => p.text)
          .join('\n')
          .trim();
        break;
      }

      // Agregar turno del modelo con sus functionCalls
      contents.push({
        role: 'model',
        parts
      });

      const responseParts = [];

      for (const call of functionCalls) {
        const toolName = String(call.name || '').trim();
        const toolArgs = call.args && typeof call.args === 'object' ? call.args : {};
        const appsScriptAction = MAPA_ACCIONES_APPS_SCRIPT[toolName];

        if (!appsScriptAction) {
          const errObj = {
            ok: false,
            error: `Herramienta no autorizada en Nivel 1: ${toolName}`
          };
          toolsUsed.push({
            name: toolName,
            args: toolArgs,
            ok: false,
            fuentes: [],
            avisos: [errObj.error]
          });
          responseParts.push({
            functionResponse: {
              name: toolName,
              response: errObj
            }
          });
          continue;
        }

        const resultadoTool = await llamarAppsScriptAdmin(appsScriptUrl, appsScriptAction, {
          ...toolArgs,
          sessionToken
        });

        if (resultadoTool && resultadoTool.ok === false && /sesi[oó]n\s+expirada/i.test(resultadoTool.error || '')) {
          return res.status(401).json({ ok: false, error: 'Sesión expirada' });
        }

        toolsUsed.push({
          name: toolName,
          args: toolArgs,
          ok: Boolean(resultadoTool?.ok),
          fuentes: Array.isArray(resultadoTool?.fuentesConsultadas)
            ? resultadoTool.fuentesConsultadas
            : [],
          avisos: Array.isArray(resultadoTool?.avisos) ? resultadoTool.avisos : []
        });

        responseParts.push({
          functionResponse: {
            name: toolName,
            response: resultadoTool || { ok: false, error: 'Sin respuesta del servidor.' }
          }
        });
      }

      // Devolver resultados reales de las herramientas a Gemini para redactar la respuesta
      contents.push({
        role: 'user',
        parts: responseParts
      });
    }

    if (!respuestaFinal) {
      respuestaFinal =
        'Se consultaron las herramientas del estudio, pero el modelo no generó un resumen textual. Intentá reformular la consulta.';
    }

    return res.status(200).json({
      ok: true,
      reply: respuestaFinal,
      toolsUsed,
      model: GEMINI_MODEL,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Error inesperado ejecutando GR Cerebro Central de IA.'
    });
  }
}
