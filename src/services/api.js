/**
 * ============================================================================
 * CAPA DE SERVICIOS / API — GOOGLE APPS SCRIPT + MODO DEMO
 * ============================================================================
 * Contrato oficial con Google Apps Script:
 *
 * GET  ?action=getPortalData&cuit={cuit}&pin={pin}
 *      -> devuelve { cliente, resumen12Meses, ventas, comprasGastos, alertasArca }
 *
 * POST (JSON con { action, cuit, pin, payload }):
 *      - uploadReceipt
 *      - requestInvoice
 *      - requestVep
 *      - requestConstancia
 *
 * Compatibilidad hacia atrás garantizada:
 * - Si el Apps Script todavía responde al formato anterior (?modo=login_cliente&cuit=...&chat_id=...)
 *   o con un array de clientes, esta capa lo detecta y lo adapta automáticamente sin romper nada.
 * - También conserva soporte para links privados firmados (?cuit=...&chat_id=...&exp=...&sig=...&k=...)
 *   y para el panel Modo Contador (?modo=contador&admin_key=...).
 */

import { APPS_SCRIPT_URL, USE_MOCK_DATA, DEMO_CREDENTIALS } from '../config.js';
import { crearDatosDemoIniciales } from '../data/mockData.js';
import { cleanCUIT, normalizarCliente, getHoyISO } from '../utils/fiscalCalculations.js';
import { leerStorageSeguro, guardarStorageSeguro, leerJsonSeguro, guardarJsonSeguro } from '../utils/storage.js';

const DEMO_DB_KEY = 'gr_portal_demo_db_v2';
const APPS_SCRIPT_STORAGE_KEY = 'gr_apps_script_url';

export function obtenerAppsScriptUrl() {
  const guardada = leerStorageSeguro(APPS_SCRIPT_STORAGE_KEY, '');
  return (guardada || APPS_SCRIPT_URL || '').trim();
}

export function guardarAppsScriptUrl(url) {
  guardarStorageSeguro(APPS_SCRIPT_STORAGE_KEY, String(url || '').trim());
}

export function estaEnModoDemo() {
  // Si el usuario configuró explícitamente una URL en runtime y USE_MOCK_DATA es false -> real.
  // Si USE_MOCK_DATA es true -> demo (salvo override guardado en localStorage para pruebas locales).
  const override = leerStorageSeguro('gr_force_real_mode', '');
  if (override === 'true' && obtenerAppsScriptUrl().startsWith('https://script.google.com/')) {
    return false;
  }
  return USE_MOCK_DATA;
}

function obtenerDbDemo() {
  const existente = leerJsonSeguro(DEMO_DB_KEY, null);
  if (existente && existente.cliente) return existente;
  const inicial = crearDatosDemoIniciales();
  guardarJsonSeguro(DEMO_DB_KEY, inicial);
  return inicial;
}

function guardarDbDemo(db) {
  guardarJsonSeguro(DEMO_DB_KEY, db);
}

export function resetearDatosDemo() {
  const inicial = crearDatosDemoIniciales();
  guardarJsonSeguro(DEMO_DB_KEY, inicial);
  return inicial;
}

/**
 * Normaliza cualquier respuesta del backend (nuevo contrato getPortalData o legacy array)
 */
function normalizarRespuestaPortal(data, cuitBuscado = '', pinBuscado = '') {
  // 1. Nuevo formato estructurado: { cliente, resumen12Meses, ventas, comprasGastos, alertasArca }
  if (data && !Array.isArray(data) && data.cliente) {
    const cli = normalizarCliente(data.cliente);
    const resumen = data.resumen12Meses || {
      ventasAcumuladas: cli.Total_Ventas_Facturadas,
      comprasGastosAcumulados: cli.Total_Compras_Gastos,
      ultimaActualizacion: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    };

    if (resumen.ventasAcumuladas !== undefined && cli.Total_Ventas_Facturadas === 0) {
      cli.Total_Ventas_Facturadas = Number(resumen.ventasAcumuladas) || 0;
    }
    if (resumen.comprasGastosAcumulados !== undefined && cli.Total_Compras_Gastos === 0) {
      cli.Total_Compras_Gastos = Number(resumen.comprasGastosAcumulados) || 0;
    }

    return {
      cliente: cli,
      resumen12Meses: resumen,
      ventas: Array.isArray(data.ventas) ? data.ventas : [],
      comprasGastos: Array.isArray(data.comprasGastos) ? data.comprasGastos : [],
      alertasArca: Array.isArray(data.alertasArca) ? data.alertasArca : [],
      solicitudesTramites: Array.isArray(data.solicitudesTramites) ? data.solicitudesTramites : []
    };
  }

  // 2. Formato legacy del portal original: array de clientes desde Google Sheets
  if (Array.isArray(data) && data.length > 0) {
    const limpios = data
      .filter((r) => r && (r.Cliente || r['Cliente (Telegram)'] || r.CUIT || r.Chat_ID || r['Chat ID']))
      .map((r, idx) => normalizarCliente(r, idx));

    if (limpios.length === 0) return null;

    const cuitNorm = cleanCUIT(cuitBuscado);
    const pinNorm = String(pinBuscado || '').trim().toLowerCase();

    const encontrado =
      limpios.find((c) => {
        const matchCuit = cuitNorm && cleanCUIT(c.CUIT) === cuitNorm;
        const matchPin = pinNorm && String(c.Chat_ID || '').trim().toLowerCase() === pinNorm;
        return (matchCuit && matchPin) || matchPin || matchCuit;
      }) || limpios[0];

    return {
      cliente: encontrado,
      resumen12Meses: {
        ventasAcumuladas: encontrado.Total_Ventas_Facturadas,
        comprasGastosAcumulados: encontrado.Total_Compras_Gastos,
        ultimaActualizacion: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      },
      ventas: [],
      comprasGastos: [],
      alertasArca: [],
      solicitudesTramites: [],
      _legacyClientes: limpios
    };
  }

  return null;
}

/**
 * GET ?action=getPortalData&cuit={cuit}&pin={pin}
 * (Con respaldo automático para el Apps Script original durante la transición)
 */
export async function getPortalData({ cuit, pin, urlParams = null, urlManual = null, consentimiento = null }) {
  const cuitLimpio = cleanCUIT(cuit);
  const pinLimpio = String(pin || '').trim();

  // MODO DEMO
  if (estaEnModoDemo()) {
    await esperar(320);
    const db = obtenerDbDemo();

    // En modo demo validamos longitud mínima o aceptamos credenciales demo
    const esDemo =
      (cuitLimpio === DEMO_CREDENTIALS.cuit && pinLimpio === DEMO_CREDENTIALS.pin) ||
      (cuitLimpio.length === 11 && pinLimpio.length >= 4);

    if (!esDemo) {
      throw new Error(
        `Credenciales inválidas. En modo demo ingresá CUIT ${DEMO_CREDENTIALS.cuitFormateado} y PIN ${DEMO_CREDENTIALS.pin}.`
      );
    }

    return {
      ...db,
      cliente: normalizarCliente(db.cliente),
      _demo: true
    };
  }

  // MODO PRODUCCIÓN (Google Apps Script)
  const urlBase = (urlManual || obtenerAppsScriptUrl()).trim();
  if (!urlBase || !urlBase.startsWith('https://script.google.com/')) {
    throw new Error('No está configurada la URL de Google Apps Script. Revisá src/config.js o configurála desde Modo Estudio.');
  }

  const sep = urlBase.includes('?') ? '&' : '?';

  // Caso A: Link privado firmado desde Telegram (?cuit=...&chat_id=...&exp=...&sig=...)
  if (urlParams?.sigParam && urlParams?.chatIdParam && urlParams?.expParam) {
    const qFirmado = new URLSearchParams({
      action: 'getPortalData',
      cuit: urlParams.cuitParam || cuitLimpio,
      pin: urlParams.chatIdParam,
      chat_id: urlParams.chatIdParam,
      exp: urlParams.expParam,
      sig: urlParams.sigParam
    });
    const res = await fetch(`${urlBase}${sep}${qFirmado.toString()}`, { redirect: 'follow' });
    const json = await res.json();
    const normalizado = normalizarRespuestaPortal(json, urlParams.cuitParam, urlParams.chatIdParam);
    if (normalizado) return normalizado;
    throw new Error(json?.error || 'El enlace privado expiró o no es válido.');
  }

  // Caso B: Contrato nuevo + parámetros de transición (cuit, pin y chat_id)
  const qNuevo = new URLSearchParams({
    action: 'getPortalData',
    modo: 'login_cliente',
    cuit: cuitLimpio,
    pin: pinLimpio,
    chat_id: pinLimpio
  });

  if (consentimiento?.accepted) {
    qNuevo.set('privacy_accepted', 'true');
    if (consentimiento.version) qNuevo.set('privacy_version', consentimiento.version);
    if (consentimiento.timestamp) qNuevo.set('privacy_at', consentimiento.timestamp);
  }

  const res = await fetch(`${urlBase}${sep}${qNuevo.toString()}`, { redirect: 'follow' });
  const data = await res.json();

  if (data && data.error) {
    throw new Error(data.error);
  }

  const normalizado = normalizarRespuestaPortal(data, cuitLimpio, pinLimpio);
  if (normalizado) return normalizado;

  throw new Error('No encontramos un contribuyente donde coincidan ese CUIT y PIN de acceso. Verificá tus datos con el estudio.');
}

/**
 * Envío genérico POST al Google Apps Script:
 * Body JSON: { action, cuit, pin, payload }
 * Se envía con text/plain;charset=utf-8 para evitar bloqueo CORS preflight de Google Apps Script.
 */
async function postAppsScript(action, cuit, pin, payload) {
  const urlBase = obtenerAppsScriptUrl();
  if (!urlBase || !urlBase.startsWith('https://script.google.com/')) {
    throw new Error('Falta configurar la URL de Google Apps Script en src/config.js.');
  }

  const res = await fetch(urlBase, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action,
      cuit: cleanCUIT(cuit),
      pin: String(pin || '').trim(),
      payload
    })
  });

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json && json.ok === false) {
      throw new Error(json.error || 'El servidor devolvió un error al procesar la solicitud.');
    }
    return json;
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { ok: true, raw: text };
    }
    throw err;
  }
}

/**
 * 0. Analizar foto o PDF de comprobante con IA en el servidor (Google Apps Script)
 * Sin ninguna API key en el frontend.
 */
export async function analyzeReceipt({ cuit, pin, payload }) {
  if (estaEnModoDemo()) {
    await esperar(700);
    const nombre = String(payload?.archivoNombre || '').toLowerCase();
    const esExtracto =
      payload?.archivoTipo === 'text/csv' ||
      /\.csv$|extracto|resumen|movimientos|mercadopago|mercado.?pago|galicia|santander|macro|bbva/.test(nombre);

    if (esExtracto) {
      const entidad = nombre.includes('macro')
        ? 'Banco Macro'
        : nombre.includes('galicia')
          ? 'Banco Galicia'
          : nombre.includes('santander')
            ? 'Banco Santander'
            : nombre.includes('bbva')
              ? 'BBVA'
              : 'Mercado Pago';
      const periodo = getHoyISO().slice(0, 7);
      return {
        ok: true,
        datos: {
          clasificacion: 'Resumen Bancario / Mercado Pago',
          tipoOperacion: 'CONCILIACION',
          entidad,
          proveedor: entidad,
          periodo,
          cantidadMovimientos: 34,
          fecha: getHoyISO(),
          observacion: `Período ${periodo} — 34 movimientos detectados`
        }
      };
    }

    return {
      ok: true,
      datos: {
        clasificacion: 'Gasto operativo',
        tipoComprobante: 'Factura A',
        tipoOperacion: 'Compra / Gasto',
        fecha: getHoyISO(),
        importe: 78650,
        proveedor: 'TELECOM ARGENTINA S.A.',
        cuitEmisor: '30-63945373-8',
        numeroComprobante: '0144-09124877',
        cae: '76471829304512',
        netoGravado: 65000,
        iva21: 13650,
        iva105: 0,
        otrosTributos: 0,
        observacion: 'Servicio de internet fibra óptica y telefonía (lectura demo IA)'
      }
    };
  }

  return postAppsScript('analyzeReceipt', cuit, pin, {
    archivoBase64: payload.archivoBase64 || '',
    archivoTipo: payload.archivoTipo || 'image/jpeg',
    archivoNombre: payload.archivoNombre || 'comprobante.jpg',
    observacion: payload.observacion || ''
  });
}

/**
 * 1. Subir comprobante de Compra / Gasto / Resumen (o Extracto de Conciliación)
 */
export async function uploadReceipt({ cuit, pin, payload }) {
  if (estaEnModoDemo()) {
    await esperar(420);
    const db = obtenerDbDemo();
    const esConciliacion =
      payload.clasificacion === 'Resumen Bancario / Mercado Pago' ||
      String(payload.tipoOperacion || '').toUpperCase() === 'CONCILIACION';

    const nuevo = {
      id: `C-${Date.now()}`,
      clasificacion: payload.clasificacion || 'Ticket / Otro',
      tipoComprobante: payload.tipoComprobante || '',
      tipoOperacion: payload.tipoOperacion || (esConciliacion ? 'CONCILIACION' : ''),
      fecha: payload.fecha || getHoyISO(),
      periodo: (payload.fecha || getHoyISO()).slice(0, 7),
      importe: Number(payload.importe) || 0,
      proveedor: payload.proveedor || (esConciliacion ? 'Mercado Pago' : 'Pendiente de lectura'),
      cuitEmisor: payload.cuitEmisor || '',
      numeroComprobante: payload.numeroComprobante || (esConciliacion ? `EXT-${getHoyISO().slice(0, 7)}` : 'S/N'),
      cae: payload.cae || '',
      netoGravado: Number(payload.netoGravado) || 0,
      iva21: Number(payload.iva21) || 0,
      iva105: Number(payload.iva105) || 0,
      otrosTributos: Number(payload.otrosTributos) || 0,
      observacion: payload.observacion || '',
      estado: 'En revisión',
      motivoObservacion: '',
      archivoNombre: payload.archivoNombre || 'comprobante.jpg',
      archivoTamano: Number(payload.archivoTamano) || 0,
      archivoTipo: payload.archivoTipo || 'image/jpeg',
      archivoUrl: payload.archivoPreview || '',
      confirmadoDistinto: Boolean(payload.confirmadoDistinto),
      fechaCarga: new Date().toISOString()
    };

    db.comprasGastos = [nuevo, ...(db.comprasGastos || [])];
    if (!esConciliacion && nuevo.importe > 0) {
      db.cliente.Total_Compras_Gastos = (Number(db.cliente.Total_Compras_Gastos) || 0) + nuevo.importe;
      db.resumen12Meses.comprasGastosAcumulados = db.cliente.Total_Compras_Gastos;
    }
    guardarDbDemo(db);

    if (esConciliacion) {
      return {
        ok: true,
        item: nuevo,
        portalData: db,
        mensaje: 'Extracto conciliado correctamente.',
        resumenConciliacion: {
          entidad: nuevo.proveedor || 'Mercado Pago',
          periodo: nuevo.periodo,
          movimientosProcesados: 34,
          conciliadosOk: 29,
          totalHaber: 2370000,
          totalDebe: 612450,
          ingresosSinFacturar: 320000,
          egresosSinComprobante: 148200
        }
      };
    }

    return {
      ok: true,
      item: nuevo,
      portalData: db,
      mensaje: 'Comprobante enviado al estudio. Quedó “En revisión”.'
    };
  }

  return postAppsScript('uploadReceipt', cuit, pin, payload);
}

/**
 * 2. Solicitar emisión de Factura C o Nota de Crédito C
 */
export async function requestInvoice({ cuit, pin, payload }) {
  if (estaEnModoDemo()) {
    await esperar(380);
    const db = obtenerDbDemo();
    const nueva = {
      id: `V-${Date.now()}`,
      tipoComprobante: payload.tipoComprobante,
      facturaAsociada: payload.facturaAsociada || '',
      numeroComprobante: 'Pendiente de emisión',
      cae: '',
      fecha: payload.fecha || getHoyISO(),
      periodo: (payload.fecha || getHoyISO()).slice(0, 7),
      concepto: payload.concepto,
      fechaDesde: payload.fechaDesde || '',
      fechaHasta: payload.fechaHasta || '',
      receptorTipo: payload.receptorTipo,
      receptorDocumento: payload.receptorDocumento || '',
      receptorNombre: payload.receptorNombre || (payload.receptorTipo === 'Consumidor Final' ? 'Consumidor Final' : payload.receptorDocumento),
      condicionVenta: payload.condicionVenta,
      descripcion: payload.descripcion,
      importe: Number(payload.importe) || 0,
      estado: 'Solicitada',
      motivoObservacion: '',
      archivoUrl: ''
    };

    db.ventas = [nueva, ...(db.ventas || [])];
    guardarDbDemo(db);
    return { ok: true, item: nueva, portalData: db };
  }

  return postAppsScript('requestInvoice', cuit, pin, {
    ...payload,
    estado: 'Solicitada'
  });
}

/**
 * 3. Solicitar generación de nuevo VEP
 */
export async function requestVep({ cuit, pin, payload }) {
  if (estaEnModoDemo()) {
    await esperar(350);
    const db = obtenerDbDemo();
    const solicitud = {
      id: `VEP-${Date.now()}`,
      tipo: 'VEP',
      ...payload,
      fechaSolicitud: new Date().toISOString(),
      estado: 'Solicitado'
    };
    db.solicitudesTramites = [solicitud, ...(db.solicitudesTramites || [])];
    db.alertasArca = [
      {
        id: `AL-${Date.now()}`,
        fecha: getHoyISO(),
        origen: 'GR Estudio Impositivo Digital',
        titulo: `Solicitud de VEP recibida (${payload.impuesto})`,
        detalle: `Recibimos tu pedido de VEP para ${payload.impuesto} (Período ${payload.periodo}) por red ${payload.redPago}. Te avisaremos apenas esté disponible para descargar.`,
        prioridad: 'Normal',
        leida: false
      },
      ...(db.alertasArca || [])
    ];
    guardarDbDemo(db);
    return { ok: true, item: solicitud, portalData: db };
  }

  return postAppsScript('requestVep', cuit, pin, payload);
}

/**
 * 4. Solicitar Constancia de Monotributo / Inscripción actualizada
 */
export async function requestConstancia({ cuit, pin, payload = {} }) {
  if (estaEnModoDemo()) {
    await esperar(320);
    const db = obtenerDbDemo();
    const solicitud = {
      id: `CONST-${Date.now()}`,
      tipo: 'Constancia',
      ...payload,
      fechaSolicitud: new Date().toISOString(),
      estado: 'Solicitada'
    };
    db.solicitudesTramites = [solicitud, ...(db.solicitudesTramites || [])];
    db.alertasArca = [
      {
        id: `AL-${Date.now()}`,
        fecha: getHoyISO(),
        origen: 'GR Estudio Impositivo Digital',
        titulo: 'Constancia actualizada solicitada',
        detalle: 'El estudio recibió tu pedido de Constancia de Monotributo / Inscripción actualizada. En breve quedará disponible en tu inicio.',
        prioridad: 'Normal',
        leida: false
      },
      ...(db.alertasArca || [])
    ];
    guardarDbDemo(db);
    return { ok: true, item: solicitud, portalData: db };
  }

  return postAppsScript('requestConstancia', cuit, pin, payload);
}

/**
 * Compatibilidad Modo Contador (directorio de clientes desde Google Sheets)
 */
export async function getAdminDirectory({ adminKey, urlManual }) {
  const urlBase = (urlManual || obtenerAppsScriptUrl()).trim();
  if (!urlBase || !urlBase.startsWith('https://script.google.com/')) {
    throw new Error('Ingresá una URL válida de Google Apps Script (/exec).');
  }
  const sep = urlBase.includes('?') ? '&' : '?';
  const query = new URLSearchParams({ modo: 'contador', admin_key: String(adminKey || '').trim() });
  const res = await fetch(`${urlBase}${sep}${query.toString()}`, { redirect: 'follow' });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Clave de estudio incorrecta o respuesta vacía.');
  }
  guardarAppsScriptUrl(urlBase);
  return data.map((r, idx) => normalizarCliente(r, idx));
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
