/**
 * ============================================================================
 * VERCEL SERVERLESS FUNCTION — GR CEREBRO CENTRAL DE IA (/api/cerebro)
 * ============================================================================
 * Etapa 3: Motor Gemini API (gemini-3.8-flash) con Function Calling estricto
 * de Nivel 1 (Solo Lectura) para el módulo /admin.
 *
 * Variables de entorno requeridas en Vercel (Settings -> Environment Variables):
 *  - GEMINI_API_KEY   : API Key de Google AI Studio / Gemini API
 *  - APPS_SCRIPT_URL  : URL /exec de la Web App de Google Apps Script del estudio
 *  - GEMINI_MODEL     : (Opcional) Modelo Gemini a utilizar (por defecto: gemini-3.8-flash)
 *
 * Seguridad:
 *  - Verifica sessionToken contra Apps Script (admin_verify_session) ANTES de
 *    invocar a Gemini.
 *  - Nunca hardcodea claves ni expone GEMINI_API_KEY al navegador.
 *  - Solo expone las 4 herramientas de Nivel 1 (Solo Lectura).
 */

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const RETRY_DELAY_MS = 800;
const MAX_TOOL_ROUNDS = 5;

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

function normalizarTextoPlano(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatARSLocal(valor) {
  const num = Number(valor);
  if (!Number.isFinite(num) || num === 0) return '$ 0,00';
  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(num));
  return `${num < 0 ? '-' : ''}$ ${formatted}`;
}

const SYSTEM_INSTRUCTION = `Sos el asistente técnico de inteligencia y control de GR Servicios Contables (Estudio del Contador Público Germán Read, Salta, Argentina), operando en el módulo privado /admin bajo estricto Nivel 1 (Solo Lectura).

REGLAS OBLIGATORIAS E INQUEBRANTABLES:
1. Basate EXCLUSIVAMENTE en los datos reales devueltos por las herramientas ejecutadas en esta conversación.
2. NUNCA inventes datos fiscales, CUITs, montos, categorías, vencimientos, alertas ni estados de pago. Si no tenés el dato verificado por una herramienta, decilo explícitamente.
3. Citá SIEMPRE la planilla y hoja de origen de cada dato (por ejemplo: "DEV_Registro de Comprobantes → Directorio Clientes", "Solicitudes App PWA", "Control Honorarios", "Control Pagos VEP", "Base_Conocimiento_IA", "Control de Vencimientos", "Control de Alertas ARCA" o "Excel Maestro").
4. Si una herramienta devuelve avisos indicando que falta configurar el ID de una planilla (por ejemplo SHEET_ID_VENCIMIENTOS, SHEET_ID_ALERTAS_ARCA o SHEET_ID_MAESTRO), informalo claramente al contador sin asumir ni completar datos faltantes.
5. Cuando el contador consulte sobre clientes, VEPs, honorarios, vencimientos, alertas ARCA o criterios/normativa vigente del estudio, invocá primero las herramientas correspondientes antes de responder.
6. Respondé en español rioplatense profesional, claro, directo y estructurado (viñetas cortas, totales claros e importes en pesos argentinos cuando los devuelva la herramienta).
7. Estás en Nivel 1 (Solo Lectura): si te piden modificar una planilla, emitir una factura, enviar un VEP o mandar un mensaje a un cliente, explicá que todavía no tenés permisos de escritura/acción habilitados y ofrecé el diagnóstico de solo lectura.`;

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
      },
      {
        name: 'consultar_normativa',
        description:
          'Consulta la hoja "Base_Conocimiento_IA" con criterios técnicos, reglas operativas y normativa con vigencia del estudio (Monotributo Art. 20, validación de VEP, DGR Salta / Convenio Multilateral, etc.). Por defecto devuelve solo reglas con Estado = VIGENTE.',
        parameters: {
          type: 'OBJECT',
          properties: {
            tema: {
              type: 'STRING',
              description:
                'Opcional: palabra clave o tema a filtrar (ej: "Monotributo", "Art. 20", "VEP", "Convenio", "DGR"). Dejar vacío para traer todas las reglas vigentes.'
            },
            incluirHistoricas: {
              type: 'BOOLEAN',
              description: 'Opcional: true para incluir también reglas históricas o derogadas.'
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
  consultar_vencimientos_y_alertas: 'admin_consultar_vencimientos_alertas',
  consultar_normativa: 'admin_consultar_normativa'
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

async function llamarGeminiUnaVez(geminiApiKey, geminiModel, contents) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const resp = await fetch(endpoint, {
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
    const err = new Error(detalle);
    err.httpStatus = resp.status;
    throw err;
  }
  return data;
}

/**
 * Llama únicamente al modelo principal (gemini-3.8-flash).
 * Si recibe error 503 ("high demand") o 429, espera 800 ms y reintenta 1 vez.
 * Si vuelve a fallar por sobrecarga, lanza error marcado con `isOverload = true`
 * para activar el respaldo determinístico local de Nivel 1 sin bloquear /admin.
 */
async function llamarGeminiPrincipalConReintento(geminiApiKey, modeloPrincipal, contents) {
  let ultimoError = null;

  for (let intento = 1; intento <= 2; intento++) {
    try {
      const data = await llamarGeminiUnaVez(geminiApiKey, modeloPrincipal, contents);
      return { data, modelUsed: modeloPrincipal };
    } catch (err) {
      ultimoError = err;
      const sobrecarga = esErrorSobrecarga(err.httpStatus, err.message);
      if (sobrecarga) {
        if (intento === 1) {
          await esperar(RETRY_DELAY_MS);
          continue;
        }
        const errSobrecarga = new Error(
          `Alta demanda en Gemini API (${modeloPrincipal}): ${err.message}`
        );
        errSobrecarga.isOverload = true;
        errSobrecarga.httpStatus = err.httpStatus;
        throw errSobrecarga;
      }
      throw new Error(`Error en Gemini API (${modeloPrincipal}): ${err.message}`);
    }
  }

  const errFinal = new Error(ultimoError?.message || 'Sobrecarga en Gemini API');
  errFinal.isOverload = true;
  throw errFinal;
}

function extraerQueryCliente(message) {
  const matchCuitGuiones = String(message || '').match(/\b(\d{2}-\d{8}-\d)\b/);
  if (matchCuitGuiones) return matchCuitGuiones[1].replace(/\D/g, '');

  const matchCuit11 = String(message || '').match(/\b(\d{11})\b/);
  if (matchCuit11) return matchCuit11[1];

  // Intentar extraer nombre/razón social luego de "cliente", "contribuyente" o "buscar"
  const matchNombre = String(message || '').match(
    /(?:cliente|contribuyente|ficha\s+de|buscar(?:\s+a)?)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ0-9.\s&'-]{2,60})/i
  );
  if (matchNombre && matchNombre[1]) {
    const limpio = matchNombre[1]
      .replace(/[¿?¡!,.;:]+$/g, '')
      .replace(/^(el|la|de|del|al|un|una)\s+/i, '')
      .trim();
    if (limpio && !/^(tienen|con|pendiente|vep|honorario)/i.test(limpio)) {
      return limpio;
    }
  }
  return '';
}

function formatearRespuestaVeps(data) {
  const lineas = [];
  const res = data?.resumen || {};
  lineas.push(`**Resumen de VEPs (Filtro: ${data?.filtroEstado || 'Todos'})**`);
  lineas.push(
    `- Solicitudes App PWA encontradas: **${res.solicitudesPwaEncontradas ?? 0}** | Directorio Clientes: **${res.clientesDirectorioEncontrados ?? 0}** | Control Pagos VEP: **${res.pagosControlVepEncontrados ?? 0}**`
  );

  const sol = Array.isArray(data?.solicitudesPwa) ? data.solicitudesPwa : [];
  if (sol.length > 0) {
    lineas.push('');
    lineas.push('**Solicitudes en "DEV_Registro de Comprobantes → Solicitudes App PWA":**');
    sol.slice(0, 15).forEach((item) => {
      lineas.push(
        `- **${item.cliente}** (CUIT ${item.cuit}) • ${item.impuesto || 'VEP'} • Período: ${item.periodo || 'S/D'} • Importe: ${formatARSLocal(item.importe)} • Estado: **${item.estado}**${item.tienePdfAdjunto ? ' (PDF adjunto)' : ''}`
      );
    });
  }

  const dirVep = Array.isArray(data?.estadoDirectorioVep) ? data.estadoDirectorioVep : [];
  if (dirVep.length > 0) {
    lineas.push('');
    lineas.push('**Estado mensual en "DEV_Registro de Comprobantes → Directorio Clientes":**');
    dirVep.slice(0, 20).forEach((item) => {
      lineas.push(
        `- **${item.cliente}** (CUIT ${item.cuit} • Cat. ${item.categoria}) • Cuota: ${formatARSLocal(item.importe)} • Estado mes: **${item.estado}**`
      );
    });
  }

  const ctrl = Array.isArray(data?.controlPagosVep) ? data.controlPagosVep : [];
  if (ctrl.length > 0 && sol.length === 0) {
    lineas.push('');
    lineas.push('**Últimos registros en "DEV_Registro de Comprobantes → Control Pagos VEP":**');
    ctrl.slice(0, 10).forEach((item) => {
      lineas.push(
        `- **${item.cliente}** (CUIT ${item.cuit}) • Período: ${item.periodo || 'S/D'} • Importe: ${formatARSLocal(item.importe)} • Estado: **${item.estado}**`
      );
    });
  }

  if (sol.length === 0 && dirVep.length === 0 && ctrl.length === 0) {
    lineas.push('- No se encontraron VEPs que coincidan con ese filtro en las hojas consultadas.');
  }

  const avisos = Array.isArray(data?.avisos) ? data.avisos : [];
  if (avisos.length > 0) {
    lineas.push('');
    avisos.forEach((a) => lineas.push(`- Aviso: ${a}`));
  }

  return lineas.join('\n');
}

function formatearRespuestaHonorarios(data) {
  const lineas = [];
  const res = data?.resumen || {};
  lineas.push(`**Estado de Honorarios (Filtro: ${data?.filtroEstado || 'Todos'})**`);
  lineas.push(
    `- Evaluados: **${res.totalEvaluados ?? 0}** | Pendientes: **${res.cantidadPendientes ?? 0}** | Vencidos: **${res.cantidadVencidos ?? 0}** | Verificar/Parcial: **${res.cantidadVerificarOParcial ?? 0}** | Pagados: **${res.cantidadPagados ?? 0}**`
  );
  if (res.montoPendienteEstimado > 0) {
    lineas.push(`- Total estimado pendiente de cobro: **${formatARSLocal(res.montoPendienteEstimado)}**`);
  }

  const lista = Array.isArray(data?.clientesHonorarios) ? data.clientesHonorarios : [];
  if (lista.length > 0) {
    lineas.push('');
    lineas.push('**Detalle en "DEV_Registro de Comprobantes → Directorio Clientes":**');
    lista.slice(0, 25).forEach((c) => {
      lineas.push(
        `- **${c.cliente}** (CUIT ${c.cuit} • Cat. ${c.categoria}) • Honorario: ${formatARSLocal(c.importeHonorarios)} • Estado: **${c.estadoHonorarios}**`
      );
    });
  } else {
    lineas.push('- No hay clientes en ese estado en Directorio Clientes.');
  }

  const pagos = Array.isArray(data?.ultimosPagosControlHonorarios)
    ? data.ultimosPagosControlHonorarios
    : [];
  if (pagos.length > 0) {
    lineas.push('');
    lineas.push('**Últimos pagos registrados en "DEV_Registro de Comprobantes → Control Honorarios":**');
    pagos.slice(0, 5).forEach((p) => {
      lineas.push(
        `- **${p.cliente}** • Período: ${p.periodo || 'S/D'} • Pagado: ${formatARSLocal(p.importePagado)} • Estado: **${p.estado}** (${p.fechaRegistro || 's/f'})`
      );
    });
  }

  const avisos = Array.isArray(data?.avisos) ? data.avisos : [];
  if (avisos.length > 0) {
    lineas.push('');
    avisos.forEach((a) => lineas.push(`- Aviso: ${a}`));
  }

  return lineas.join('\n');
}

function formatearRespuestaVencimientosAlertas(data) {
  const lineas = [];
  lineas.push('**Próximos Vencimientos y Alertas ARCA**');

  const venc = data?.vencimientos;
  if (venc) {
    lineas.push('');
    lineas.push(`**1. ${venc.libro || 'Control de Vencimientos'}:**`);
    if (!venc.configurado) {
      lineas.push(`- ${venc.aviso || 'Falta configurar SHEET_ID_VENCIMIENTOS en Propiedades del Script.'}`);
    } else if (Array.isArray(venc.registros) && venc.registros.length > 0) {
      venc.registros.slice(0, 12).forEach((reg) => {
        const origen = reg._origen || venc.libro;
        const campos = Object.entries(reg)
          .filter(([k]) => k !== '_origen')
          .slice(0, 5)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' • ');
        lineas.push(`- ${campos} _(${origen})_`);
      });
    } else {
      lineas.push('- Sin registros cargados en las hojas principales de Control de Vencimientos.');
    }
  }

  const al = data?.alertasArca;
  if (al) {
    lineas.push('');
    lineas.push(`**2. ${al.libro || 'Control de Alertas ARCA'}:**`);
    if (!al.configurado) {
      lineas.push(`- ${al.aviso || 'Falta configurar SHEET_ID_ALERTAS_ARCA en Propiedades del Script.'}`);
    } else if (Array.isArray(al.registros) && al.registros.length > 0) {
      al.registros.slice(0, 12).forEach((reg) => {
        const origen = reg._origen || al.libro;
        const campos = Object.entries(reg)
          .filter(([k]) => k !== '_origen')
          .slice(0, 5)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' • ');
        lineas.push(`- ${campos} _(${origen})_`);
      });
    } else {
      lineas.push('- Sin alertas recientes registradas en Control de Alertas ARCA.');
    }
  }

  const avisos = Array.isArray(data?.avisos) ? data.avisos : [];
  if (avisos.length > 0) {
    lineas.push('');
    avisos.forEach((a) => lineas.push(`- Aviso: ${a}`));
  }

  return lineas.join('\n');
}

function formatearRespuestaCliente(data) {
  const lineas = [];
  lineas.push(`**Búsqueda de Cliente ("${data?.query || ''}")**`);

  const clientes = Array.isArray(data?.clientes) ? data.clientes : [];
  if (clientes.length > 0) {
    lineas.push('');
    lineas.push('**Coincidencias en "DEV_Registro de Comprobantes → Directorio Clientes":**');
    clientes.forEach((c) => {
      lineas.push(
        `- **${c.cliente}** • CUIT: ${c.cuit} • Cat. **${c.categoria}** (${c.actividad}) • Cuota: ${formatARSLocal(c.cuotaMonotributo)} • Estado VEP mes: **${c.estadoMesActualVep}** • Honorarios: ${formatARSLocal(c.importeHonorarios)} (**${c.estadoHonorarios}**) • Modalidad ARCA: **${c.modalidadArca}**${c.diagnosticoSemaforo ? ` • Semáforo: ${c.diagnosticoSemaforo}` : ''}`
      );
    });
  } else {
    lineas.push('- No se encontraron coincidencias en "DEV_Registro de Comprobantes → Directorio Clientes".');
  }

  const maestro = Array.isArray(data?.coincidenciasMaestro) ? data.coincidenciasMaestro : [];
  if (maestro.length > 0) {
    lineas.push('');
    lineas.push('**Coincidencias adicionales en Excel Maestro:**');
    maestro.slice(0, 8).forEach((m) => {
      const campos = Object.entries(m.datos || {})
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' • ');
      lineas.push(`- **${m.origen}** (fila ${m.fila}): ${campos}`);
    });
  }

  const avisos = Array.isArray(data?.avisos) ? data.avisos : [];
  if (avisos.length > 0) {
    lineas.push('');
    avisos.forEach((a) => lineas.push(`- Aviso: ${a}`));
  }

  return lineas.join('\n');
}

function formatearRespuestaNormativa(data) {
  const lineas = [];
  lineas.push(
    `**Base de Conocimiento y Normativa (${data?.incluirHistoricas ? 'Vigentes e históricas' : 'Solo VIGENTES'})**`
  );
  lineas.push('Fuente: **DEV_Registro de Comprobantes → Base_Conocimiento_IA**');

  const reglas = Array.isArray(data?.reglas) ? data.reglas : [];
  if (reglas.length > 0) {
    lineas.push('');
    reglas.forEach((r) => {
      lineas.push(
        `- **${r.id} — ${r.tema}** [${r.categoria || 'General'} | Estado: **${r.estado}**]: ${r.contenidoRegla}${r.fuenteNormativa ? ` _(Fuente: ${r.fuenteNormativa} • Vigencia: ${r.vigenciaDesde || 'S/D'} → ${r.vigenciaHasta || 'Vigente'})_` : ''}`
      );
    });
  } else {
    lineas.push('- No se encontraron reglas registradas para ese criterio en Base_Conocimiento_IA.');
  }

  const avisos = Array.isArray(data?.avisos) ? data.avisos : [];
  if (avisos.length > 0) {
    lineas.push('');
    avisos.forEach((a) => lineas.push(`- Aviso: ${a}`));
  }
  return lineas.join('\n');
}

/**
 * Respaldo determinístico local de Nivel 1 (sin depender de Gemini API)
 * para mantener operativo el panel /admin cuando Gemini devuelve 503/429.
 */
async function ejecutarRespaldoDeterministico(appsScriptUrl, sessionToken, message) {
  const msgNorm = normalizarTextoPlano(message);
  const tieneVep = /\bveps?\b/.test(msgNorm);
  const tieneHonorario = /honorario/.test(msgNorm);
  const tieneVencOAlerta = /vencim|alerta/.test(msgNorm);
  const tieneNormativa = /normativ|regla|criterio|vigencia|art\.?\s*20|base\s+de\s+conocimiento/.test(msgNorm);
  const tieneCuit11 = /\b\d{2}-?\d{8}-?\d\b/.test(String(message || ''));
  const tieneCliente = /\bcliente\b|\bcontribuyente\b/.test(msgNorm) || tieneCuit11;

  const toolsUsed = [];
  const bloquesTexto = [];

  const ejecutarAccion = async (toolName, appsScriptAction, args) => {
    const res = await llamarAppsScriptAdmin(appsScriptUrl, appsScriptAction, {
      ...args,
      sessionToken
    });
    if (res && res.ok === false && /sesi[oó]n\s+expirada/i.test(res.error || '')) {
      const errExp = new Error('Sesión expirada');
      errExp.sessionExpired = true;
      throw errExp;
    }
    toolsUsed.push({
      name: toolName,
      args,
      ok: Boolean(res?.ok),
      fuentes: Array.isArray(res?.fuentesConsultadas) ? res.fuentesConsultadas : [],
      avisos: Array.isArray(res?.avisos) ? res.avisos : []
    });
    return res;
  };

  if (tieneVep) {
    const estado = /pendient|revis/.test(msgNorm)
      ? 'Pendiente'
      : /solicit/.test(msgNorm)
        ? 'Solicitado'
        : /enviad/.test(msgNorm)
          ? 'Enviado'
          : /pagad/.test(msgNorm)
            ? 'Pagado'
            : 'Todos';
    const dataVep = await ejecutarAccion('consultar_veps', 'admin_consultar_veps', { estado });
    bloquesTexto.push(formatearRespuestaVeps(dataVep));
  }

  if (tieneHonorario) {
    const estado = /vencid/.test(msgNorm)
      ? 'Vencido'
      : /pendient|adeud|debe/.test(msgNorm)
        ? 'Pendiente'
        : /pagad/.test(msgNorm)
          ? 'Pagado'
          : 'Todos';
    const dataHon = await ejecutarAccion('consultar_honorarios', 'admin_consultar_honorarios', {
      estado
    });
    bloquesTexto.push(formatearRespuestaHonorarios(dataHon));
  }

  if (tieneVencOAlerta) {
    const tipo =
      /vencim/.test(msgNorm) && !/alerta/.test(msgNorm)
        ? 'vencimientos'
        : /alerta/.test(msgNorm) && !/vencim/.test(msgNorm)
          ? 'alertas'
          : 'todos';
    const dataVA = await ejecutarAccion(
      'consultar_vencimientos_y_alertas',
      'admin_consultar_vencimientos_alertas',
      { tipo, limite: 20 }
    );
    bloquesTexto.push(formatearRespuestaVencimientosAlertas(dataVA));
  }

  if (tieneNormativa) {
    const incluirHistoricas = /historic|derogad|todas\s+las\s+reglas/.test(msgNorm);
    const dataNorm = await ejecutarAccion('consultar_normativa', 'admin_consultar_normativa', {
      tema: '',
      incluirHistoricas
    });
    bloquesTexto.push(formatearRespuestaNormativa(dataNorm));
  }

  // Solo disparar búsqueda de cliente si tiene CUIT de 11 dígitos o menciona "cliente" sin ser una consulta genérica de VEP/honorarios
  const queryCliente = extraerQueryCliente(message);
  if (tieneCuit11 || (tieneCliente && queryCliente && !tieneVep && !tieneHonorario && !tieneNormativa)) {
    const dataCli = await ejecutarAccion('buscar_cliente', 'admin_buscar_cliente', {
      query: queryCliente || message
    });
    bloquesTexto.push(formatearRespuestaCliente(dataCli));
  }

  const etiquetaDiscreta = '(Modo directo Nivel 1 por alta demanda en Gemini API)';

  if (bloquesTexto.length === 0) {
    return {
      reply:
        `Gemini API reporta alta demanda momentánea (503/429). Podés consultar directamente sin esperar mencionando **VEP**, **honorarios**, **vencimientos / alertas**, **normativa / criterios** o un **CUIT de 11 dígitos / cliente**.\n\n${etiquetaDiscreta}`,
      toolsUsed
    };
  }

  return {
    reply: `${bloquesTexto.join('\n\n')}\n\n${etiquetaDiscreta}`,
    toolsUsed
  };
}

async function listarModelosDisponiblesGemini(geminiApiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiApiKey)}`;
  const resp = await fetch(url, { method: 'GET' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detalle = data?.error?.message || `HTTP ${resp.status}`;
    throw new Error(`Error consultando modelos en Gemini API: ${detalle}`);
  }

  const listaCruda = Array.isArray(data?.models) ? data.models : [];
  const models = listaCruda.map((m) => {
    const name = String(m?.name || '');
    return {
      id: name.replace(/^models\//, ''),
      name,
      displayName: String(m?.displayName || ''),
      description: String(m?.description || ''),
      supportedGenerationMethods: Array.isArray(m?.supportedGenerationMethods)
        ? m.supportedGenerationMethods
        : [],
      inputTokenLimit: m?.inputTokenLimit ?? null,
      outputTokenLimit: m?.outputTokenLimit ?? null
    };
  });

  const generateContentModels = models
    .filter((m) => m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => m.id);

  const modeloPrincipal = obtenerModeloGemini();

  return {
    ok: true,
    action: 'list_models',
    configuredPrimary: modeloPrincipal,
    totalModels: models.length,
    generateContentCount: generateContentModels.length,
    generateContentModels,
    models
  };
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

  const action = String(body.action || '').trim().toLowerCase();
  const message = String(body.message || '').trim();
  const sessionToken = String(body.sessionToken || '').trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Sesión expirada' });
  }
  if (action !== 'list_models' && !message) {
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

  // 3B. Modo diagnóstico autenticado: listar modelos disponibles para la GEMINI_API_KEY actual
  if (action === 'list_models') {
    try {
      const diagnosticoModelos = await listarModelosDisponiblesGemini(geminiApiKey);
      return res.status(200).json(diagnosticoModelos);
    } catch (errList) {
      return res.status(502).json({
        ok: false,
        error: errList?.message || 'No se pudo consultar el catálogo de modelos de Gemini.'
      });
    }
  }

  // 4. Bucle de conversación con modelo principal (gemini-3.8-flash) + respaldo determinístico local Nivel 1
  const geminiModel = obtenerModeloGemini();

  const contents = [
    ...normalizarHistorialParaGemini(history),
    { role: 'user', parts: [{ text: message }] }
  ];

  const toolsUsed = [];

  try {
    let respuestaFinal = '';

    for (let ronda = 0; ronda < MAX_TOOL_ROUNDS; ronda++) {
      const llamada = await llamarGeminiPrincipalConReintento(geminiApiKey, geminiModel, contents);
      const geminiData = llamada.data;
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
      model: geminiModel,
      primaryModel: geminiModel,
      usedFallback: false,
      modelStatusMessage: `Respondido por modelo principal (${geminiModel})`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    // Respaldo determinístico local ante 503 ("high demand") o 429 para que /admin nunca quede bloqueado
    if (err?.isOverload || esErrorSobrecarga(err?.httpStatus, err?.message)) {
      try {
        const respaldo = await ejecutarRespaldoDeterministico(appsScriptUrl, sessionToken, message);
        return res.status(200).json({
          ok: true,
          reply: respaldo.reply,
          toolsUsed: respaldo.toolsUsed,
          model: 'modo-directo-nivel-1',
          primaryModel: geminiModel,
          usedFallback: true,
          modelStatusMessage: '(Modo directo Nivel 1 por alta demanda en Gemini API)',
          timestamp: new Date().toISOString()
        });
      } catch (errRespaldo) {
        if (errRespaldo?.sessionExpired || /sesi[oó]n\s+expirada/i.test(errRespaldo?.message || '')) {
          return res.status(401).json({ ok: false, error: 'Sesión expirada' });
        }
        return res.status(502).json({
          ok: false,
          error: `Gemini API con alta demanda y fallo en modo directo Nivel 1: ${errRespaldo?.message}`
        });
      }
    }

    return res.status(500).json({
      ok: false,
      error: err?.message || 'Error inesperado ejecutando GR Cerebro Central de IA.'
    });
  }
}
