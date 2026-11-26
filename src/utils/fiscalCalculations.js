import {
  ESCALA_MONOTRIBUTO,
  TOPE_CATEGORIA_K_VIGENTE,
  TOPE_MAXIMO_ANUAL,
  UMBRAL_ALERTA_PREVENTIVA_ART20
} from '../data/escalasMonotributo.js';

export const parseMontoSeguro = (val, fallback = 0) => {
  if (typeof val === 'number') return Number.isNaN(val) ? fallback : val;
  if (!val) return fallback;
  let s = String(val).replace(/[^\d.,-]/g, '').trim();
  if (!s) return fallback;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? fallback : n;
};

export const parseInputSimulador = (valorTexto) => {
  const limpio = String(valorTexto || '').replace(/\D/g, '');
  if (!limpio) return 0;
  const n = parseInt(limpio, 10);
  return Number.isNaN(n) ? 0 : n;
};

export const formatearInputMiles = (num) => {
  const n = Number(num);
  if (!n || Number.isNaN(n) || n <= 0) return '';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n));
};

/**
 * Formatea importes en Pesos Argentinos: $ 1.250.000,00
 */
export const formatARS = (valor) => {
  const num = Number(valor);
  const seguro = Number.isNaN(num) ? 0 : num;
  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(seguro));
  return `${seguro < 0 ? '-' : ''}$ ${formatted}`;
};

export const formatARSSinDecimales = (valor) => {
  const num = Number(valor);
  const seguro = Number.isNaN(num) ? 0 : num;
  const formatted = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0
  }).format(Math.round(Math.abs(seguro)));
  return `${seguro < 0 ? '-' : ''}$ ${formatted}`;
};

/**
 * Limpia y formatea CUIT visualmente como XX-XXXXXXXX-X
 */
export const cleanCUIT = (valor) => String(valor || '').replace(/\D/g, '').slice(0, 11);

export const formatCUIT = (valor) => {
  const digits = cleanCUIT(valor);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10, 11)}`;
};

export const formatFechaAR = (isoDate) => {
  if (!isoDate) return '-';
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return String(isoDate);
};

export const getHoyISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const getPeriodoActual = () => getHoyISO().slice(0, 7);

export const getRangoMesActual = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const inicio = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  const fin = `${y}-${String(m + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fin };
};

export const normalizarCliente = (raw = {}, index = 0) => {
  const cat =
    String(raw.Categoria_Actual || raw['Categoría'] || raw.Categoria || raw.categoria || 'A')
      .replace(/categor[ií]a/i, '')
      .trim()
      .toUpperCase() || 'A';

  const escalaObj = ESCALA_MONOTRIBUTO.find((e) => e.cat === cat) || ESCALA_MONOTRIBUTO[0];
  const actividadStr = String(
    raw.Actividad ||
      raw.actividad ||
      raw['Actividad (Servicios / Cosas Muebles)'] ||
      raw['Actividad (Servicios / Venta)'] ||
      'Servicios'
  ).trim();
  const esBienes = /mueble|producto|venta/i.test(actividadStr);
  const topeRaw = parseMontoSeguro(raw.Tope_Categoria_Actual || raw['Tope Anual Proyectado c/ IPC ($)']);
  const cuotaDefault = esBienes ? escalaObj.cuotaBienes : escalaObj.cuotaServicios;
  const limiteComprasRaw = parseMontoSeguro(
    raw.Limite_Compras_Art20_CatK ||
      raw['Límite Anual Compras 40% / 80% s/ Cat. K ($)'] ||
      raw['Límite Anual Compras 40% / 80% ($)'],
    0
  );

  const diaVenc = parseMontoSeguro(
    raw.Dia_Vencimiento || raw['Día Vencimiento'] || raw['Vencimiento (Día)'],
    20
  );

  const hoy = new Date();
  const fechaVencDefault = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(
    Math.min(28, Math.max(1, Math.round(diaVenc)))
  ).padStart(2, '0')}`;

  const modalidadArcaRaw = String(
    raw.Modalidad_ARCA ||
      raw.modalidad_arca ||
      raw.modalidadArca ||
      raw['Modalidad ARCA'] ||
      raw.Modalidad ||
      raw.modalidad ||
      raw.Modo_Facturacion ||
      raw.modoFacturacion ||
      raw['Modo Facturación'] ||
      raw['Modo Facturacion'] ||
      'MANUAL_WEB'
  ).trim();

  const esAutomaticoWs =
    Boolean(raw.facturacionAutomatica) ||
    /autom[aá]tico|automatico_ws|direct/i.test(modalidadArcaRaw);

  return {
    Cliente: String(raw.Cliente || raw.nombre || raw['Cliente (Telegram)'] || raw['Nombre'] || `Cliente #${index + 1}`).trim(),
    NombreFantasia: String(raw.NombreFantasia || raw.nombreFantasia || '').trim(),
    CUIT: cleanCUIT(raw.CUIT || raw.cuit || raw['Cuit'] || '') || `S/D-${index + 1}`,
    Chat_ID: String(raw.Chat_ID || raw.PIN || raw.pin || raw['Chat ID'] || raw['Chat ID (Vinculado Directorio)'] || 'S/D').trim(),
    PIN: String(raw.PIN || raw.pin || raw.Chat_ID || raw['Chat ID'] || 'S/D').trim(),
    Localidad: String(raw.Localidad || raw.localidad || 'Salta').trim(),
    Actividad: actividadStr,
    Categoria_Actual: cat,
    Importe_Cuota: parseMontoSeguro(raw.Importe_Cuota || raw.cuota || raw['Importe Cuota'] || raw['Importe Cuota Mes'], cuotaDefault),
    Dia_Vencimiento: diaVenc,
    Fecha_Proximo_Vencimiento: String(raw.Fecha_Proximo_Vencimiento || raw.proximoVencimiento || fechaVencDefault),
    Tope_Categoria_Actual: topeRaw > 0 ? topeRaw : escalaObj.tope,
    Tope_Maximo_Monotributo: parseMontoSeguro(raw.Tope_Maximo_Monotributo, TOPE_CATEGORIA_K_VIGENTE),
    Limite_Compras_Art20_CatK: limiteComprasRaw,
    Total_Ventas_Facturadas: parseMontoSeguro(
      raw.Total_Ventas_Facturadas ?? raw.ventasAcumuladas ?? raw['Ventas Anuales Acumuladas ($)'],
      0
    ),
    Total_Compras_Gastos: parseMontoSeguro(
      raw.Total_Compras_Gastos ?? raw.comprasGastosAcumulados ?? raw['Compras Acumuladas Bot ($)'],
      0
    ),
    Estado_Pago: String(raw.Estado_Pago || raw.estadoPago || raw['Estado Mes'] || raw['Estado Mes Actual'] || 'PENDIENTE').trim(),
    Modalidad_ARCA: modalidadArcaRaw,
    Modo_Facturacion: modalidadArcaRaw,
    facturacionAutomatica: esAutomaticoWs,
    Ultimo_Comprobante_Bot: String(raw.Ultimo_Comprobante_Bot || raw['Diagnóstico Monotributo'] || '🟢 DENTRO DEL LÍMITE').trim(),
    Link_Privado: String(raw.Link_Privado || '').trim(),
    vepDisponible: raw.vepDisponible || null,
    vepSolicitadoPendiente: Boolean(raw.vepSolicitadoPendiente),
    solicitudVepPendiente: raw.solicitudVepPendiente || null,
    constanciaDisponible: raw.constanciaDisponible || null
  };
};

export const CLIENTE_PLANTILLA_NEUTRO = normalizarCliente({
  Cliente: 'Contribuyente',
  CUIT: '00000000000',
  Chat_ID: 'S/D',
  Actividad: 'Servicios',
  Categoria_Actual: 'A',
  Importe_Cuota: 58027.18,
  Dia_Vencimiento: 20,
  Tope_Categoria_Actual: 13431324.65,
  Tope_Maximo_Monotributo: TOPE_CATEGORIA_K_VIGENTE,
  Total_Ventas_Facturadas: 0,
  Total_Compras_Gastos: 0,
  Estado_Pago: 'PENDIENTE'
});

/**
 * CÁLCULOS TRIBUTARIOS UNIFICADOS
 * Conserva intactas las fórmulas fiscales originales:
 * - Ventas evaluadas contra el tope de la categoría actual (con Factor IPC 1.1184) y Cat. K ($141.601.562,06)
 * - Compras/Gastos Art. 20 SIEMPRE evaluados sobre TOPE_CATEGORIA_K_VIGENTE ($126.610.838,75):
 *     * Servicios: 40% ($ 50.644.335,50)
 *     * Venta de Cosas Muebles: 80% ($ 101.288.671,00)
 * - Alerta preventiva Art. 20 al 75% y crítica al 100%
 */
export function calcularEstadoMonotributo(cliente, montoSimuladoVentas = 0, montoSimuladoCompras = 0) {
  const cli = cliente || CLIENTE_PLANTILLA_NEUTRO;
  const ventasBase = parseMontoSeguro(cli?.Total_Ventas_Facturadas);
  const comprasBase = parseMontoSeguro(cli?.Total_Compras_Gastos);
  const simVentas = parseMontoSeguro(montoSimuladoVentas);
  const simCompras = parseMontoSeguro(montoSimuladoCompras);

  const ventasTotales = ventasBase + simVentas;
  const comprasTotales = comprasBase + simCompras;

  const catActualStr = String(cli?.Categoria_Actual || 'A').toUpperCase();
  const escalaActualObj = ESCALA_MONOTRIBUTO.find((e) => e.cat === catActualStr) || ESCALA_MONOTRIBUTO[0];
  const topeCat = Math.max(1, parseMontoSeguro(cli?.Tope_Categoria_Actual, escalaActualObj.tope));
  const topeMaxVentasProyectado = TOPE_MAXIMO_ANUAL;

  const porcentaje = Math.round(((ventasTotales / topeCat) * 100) * 10) / 10;
  const porcentajeSobreCatK = Math.round(((ventasTotales / topeMaxVentasProyectado) * 100) * 10) / 10;
  const margenDisponible = Math.max(0, topeCat - ventasTotales);
  const margenHastaCatK = Math.max(0, topeMaxVentasProyectado - ventasTotales);
  const excesoCategoria = Math.max(0, ventasTotales - topeCat);
  const superaMaximoMonotributo =
    ventasTotales > topeMaxVentasProyectado || (catActualStr === 'K' && ventasTotales > topeCat);

  // REGLA ART. 20 LEY DE MONOTRIBUTO (EXACTA):
  // El 40% (Servicios) o 80% (Venta de Cosas Muebles) se calcula SIEMPRE sobre el tope anual de Categoría K
  const esVentaBienes = /mueble|producto|venta/i.test(String(cli?.Actividad || ''));
  const coefLimiteCompras = esVentaBienes ? 0.8 : 0.4;
  const porcLimiteTexto = esVentaBienes ? '80%' : '40%';
  const limiteComprasArt20CatK = Math.round(TOPE_CATEGORIA_K_VIGENTE * coefLimiteCompras * 100) / 100;

  const porcentajeComprasArt20 =
    limiteComprasArt20CatK > 0
      ? Math.round(((comprasTotales / limiteComprasArt20CatK) * 100) * 10) / 10
      : 0;
  const alertaExclusionGastos = comprasTotales > limiteComprasArt20CatK;
  const alertaPrecaucionGastos =
    !alertaExclusionGastos && comprasTotales / limiteComprasArt20CatK >= UMBRAL_ALERTA_PREVENTIVA_ART20;
  const margenGastosDisponible = Math.max(0, limiteComprasArt20CatK - comprasTotales);
  const excesoGastosArt20 = Math.max(0, comprasTotales - limiteComprasArt20CatK);

  // Categoría sugerida según Ventas + nueva cuota mensual estimada
  const escalaSugeridaVentas = ESCALA_MONOTRIBUTO.find((e) => ventasTotales <= e.tope);
  const categoriaProyectadaVentas = escalaSugeridaVentas ? escalaSugeridaVentas.cat : 'EXCLUSIÓN (Régimen General)';
  const cuotaActual = parseMontoSeguro(cli?.Importe_Cuota, esVentaBienes ? escalaActualObj.cuotaBienes : escalaActualObj.cuotaServicios);
  const cuotaProyectada = escalaSugeridaVentas
    ? esVentaBienes
      ? escalaSugeridaVentas.cuotaBienes
      : escalaSugeridaVentas.cuotaServicios
    : null;
  const diferenciaCuota = cuotaProyectada !== null ? cuotaProyectada - cuotaActual : null;

  const estadoComprasArt20 = alertaExclusionGastos
    ? 'EXCLUSIÓN ART. 20 (Supera Cat. K)'
    : alertaPrecaucionGastos
      ? 'ALERTA PREVENTIVA (≥ 75%)'
      : 'DENTRO DEL LÍMITE LEGAL';

  const categoriaProyectada =
    alertaExclusionGastos || !escalaSugeridaVentas ? 'EXCLUSIÓN (Régimen General)' : escalaSugeridaVentas.cat;

  const idxActual = ESCALA_MONOTRIBUTO.findIndex((e) => e.cat === catActualStr);
  const catSiguiente =
    idxActual >= 0 && idxActual < ESCALA_MONOTRIBUTO.length - 1
      ? ESCALA_MONOTRIBUTO[idxActual + 1].cat
      : 'K (Tope Máximo)';

  let estado = 'VERDE';
  let tituloEstado = 'DENTRO DEL LÍMITE';
  let mensajeSemaforo = `Dentro de los parámetros de la Categoría ${catActualStr}. Margen de facturación: ${formatARS(margenDisponible)} | Margen compras Art. 20 (${porcLimiteTexto} s/ Cat. K): ${formatARS(margenGastosDisponible)}.`;
  let colorHex = '#16a34a';
  let bgBadge = 'bg-emerald-100 text-emerald-900 border-emerald-300';
  let bgBanner = 'bg-emerald-50 border-emerald-500 text-emerald-950';

  const superaTopeIngresosOCompras = ventasTotales > topeCat || alertaExclusionGastos;
  const enZonaPrecaucion = ventasTotales / topeCat >= 0.8 || alertaPrecaucionGastos;

  if (superaTopeIngresosOCompras) {
    estado = 'ROJO';
    colorHex = '#dc2626';
    bgBadge = 'bg-red-100 text-red-900 border-red-300';
    bgBanner = 'bg-red-50 border-red-600 text-red-950';

    if (alertaExclusionGastos) {
      tituloEstado = 'EXCLUSIÓN ART. 20 (COMPRAS)';
      mensajeSemaforo = `Las compras y gastos (${formatARS(comprasTotales)}) superan en ${formatARS(excesoGastosArt20)} el límite legal del ${porcLimiteTexto} sobre la Categoría K (${formatARS(limiteComprasArt20CatK)}). Riesgo de exclusión por Art. 20.`;
    } else if (superaMaximoMonotributo) {
      tituloEstado = 'EXCLUSIÓN (SUPERA CAT. K)';
      mensajeSemaforo = `ALERTA CRÍTICA: El monto acumulado de ventas (${formatARS(ventasTotales)}) supera el tope máximo de la Categoría K (${formatARS(topeMaxVentasProyectado)}).`;
    } else {
      tituloEstado = 'SUPERA TOPE — RECATEGORIZAR';
      mensajeSemaforo = `Límite de facturación de Categoría ${catActualStr} superado en ${formatARS(excesoCategoria)}. Corresponde recategorizar a Categoría ${categoriaProyectadaVentas}.`;
    }
  } else if (enZonaPrecaucion) {
    estado = 'AMARILLO';
    tituloEstado = 'ALERTA PREVENTIVA';
    mensajeSemaforo = `Atención preventiva: te estás acercando al límite permitido (Ventas Cat. ${catActualStr}: ${porcentaje.toFixed(1)}% | Compras Art. 20 s/ Cat. K: ${porcentajeComprasArt20.toFixed(1)}%). Se sugiere proyectar pase a Categoría ${catSiguiente}.`;
    colorHex = '#d97706';
    bgBadge = 'bg-amber-100 text-amber-900 border-amber-300';
    bgBanner = 'bg-amber-50 border-amber-500 text-amber-950';
  }

  let recomendaciones = [];
  if (estado === 'VERDE') {
    recomendaciones = [
      `Facturación saludable: tenés un margen disponible de ${formatARS(margenDisponible)} antes del tope proyectado de Categoría ${catActualStr}.`,
      `Compras controladas (Art. 20): para ${cli?.Actividad || 'Servicios'} tu límite anual es el ${porcLimiteTexto} del tope de Categoría K (${formatARS(limiteComprasArt20CatK)}). Llevás ${porcentajeComprasArt20.toFixed(1)}% utilizado y te quedan ${formatARS(margenGastosDisponible)}.`
    ];
  } else if (estado === 'AMARILLO') {
    recomendaciones = [
      `Zona de precaución: te quedan ${formatARS(margenDisponible)} de margen de ventas en Categoría ${catActualStr} y ${formatARS(margenGastosDisponible)} de margen de compras Art. 20 (${porcLimiteTexto} s/ Cat. K).`,
      `Proyectá con el estudio el posible pase a Categoría ${catSiguiente} en la próxima recategorización semestral.`
    ];
  } else {
    recomendaciones = [
      `Parámetro superado. Corresponde recategorizar o revisar el encuadre impositivo hacia ${categoriaProyectada}.`,
      `Contactá a GR Estudio Impositivo Digital para auditar tus comprobantes cargados en la app.`
    ];
  }

  if (alertaExclusionGastos) {
    recomendaciones.unshift(
      `ALERTA CRÍTICA ART. 20: Tus compras registradas + simuladas (${formatARS(comprasTotales)}) superan en ${formatARS(excesoGastosArt20)} el límite del ${porcLimiteTexto} sobre la Categoría K (${formatARS(limiteComprasArt20CatK)}).`
    );
  } else if (alertaPrecaucionGastos) {
    recomendaciones.unshift(
      `ALERTA PREVENTIVA ART. 20 (≥75%): Alcanzaste el ${porcentajeComprasArt20.toFixed(1)}% de tu tope anual de compras sobre Categoría K (${formatARS(limiteComprasArt20CatK)}).`
    );
  }

  return {
    ventasBase,
    comprasBase,
    simVentas,
    simCompras,
    ventasTotales,
    comprasTotales,
    topeCat,
    topeMaxVentasProyectado,
    topeMax: TOPE_CATEGORIA_K_VIGENTE,
    porcentaje,
    porcentajeSobreCatK,
    margenDisponible,
    margenHastaCatK,
    excesoCategoria,
    superaMaximoMonotributo,
    categoriaProyectada,
    categoriaProyectadaVentas,
    cuotaActual,
    cuotaProyectada,
    diferenciaCuota,
    estadoComprasArt20,
    estado,
    tituloEstado,
    mensajeSemaforo,
    colorHex,
    bgBadge,
    bgBanner,
    esVentaBienes,
    porcLimiteTexto,
    porcentajeComprasArt20,
    limiteComprasArt20CatK,
    alertaExclusionGastos,
    alertaPrecaucionGastos,
    margenGastosDisponible,
    excesoGastosArt20,
    recomendaciones
  };
}
