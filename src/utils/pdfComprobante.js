import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { cleanCUIT, formatARS, formatCUIT, formatFechaAR, getHoyISO } from './fiscalCalculations.js';
import { DISENO_DEFAULT } from './marcaDiseno.js';

function hexToRgb(hex) {
  const limpio = String(hex || '#111827').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return [17, 24, 39];
  return [
    parseInt(limpio.slice(0, 2), 16),
    parseInt(limpio.slice(2, 4), 16),
    parseInt(limpio.slice(4, 6), 16)
  ];
}

function mezclarConBlanco([r, g, b], factor = 0.88) {
  return [
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor)
  ];
}

function sumarDiasFechaISO(isoFecha, dias) {
  const base = isoFecha && /^\d{4}-\d{2}-\d{2}$/.test(isoFecha) ? new Date(`${isoFecha}T12:00:00`) : new Date();
  base.setDate(base.getDate() + Math.max(0, Number(dias) || 0));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resolverMetadatosArca(tipoComprobante = 'Factura C', arcaData = {}) {
  const t = String(tipoComprobante || 'Factura C').toLowerCase();
  if (arcaData.letra && arcaData.codigoTipo) {
    return {
      letra: String(arcaData.letra).toUpperCase(),
      codigo: String(arcaData.codigoTipo).padStart(3, '0'),
      codigoNum: Number(arcaData.codigoTipo) || 11,
      titulo: String(arcaData.tituloComprobante || tipoComprobante).toUpperCase()
    };
  }
  if (t.includes('nota') && t.includes('cr')) {
    if (t.includes(' a')) return { letra: 'A', codigo: '003', codigoNum: 3, titulo: 'NOTA DE CRÉDITO' };
    if (t.includes(' b')) return { letra: 'B', codigo: '008', codigoNum: 8, titulo: 'NOTA DE CRÉDITO' };
    return { letra: 'C', codigo: '013', codigoNum: 13, titulo: 'NOTA DE CRÉDITO' };
  }
  if (t.includes('factura a') || t === 'a') return { letra: 'A', codigo: '001', codigoNum: 1, titulo: 'FACTURA' };
  if (t.includes('factura b') || t === 'b') return { letra: 'B', codigo: '006', codigoNum: 6, titulo: 'FACTURA' };
  return { letra: 'C', codigo: '011', codigoNum: 11, titulo: 'FACTURA' };
}

function parsearPtoVtaYNro(numeroStr = '') {
  const m = String(numeroStr || '').match(/(\d{1,5})\s*-\s*(\d{1,8})/);
  if (m) {
    return {
      ptoVta: Number(m[1]) || 1,
      nroCmp: Number(m[2]) || 1,
      formateado: `${String(m[1]).padStart(4, '0')}-${String(m[2]).padStart(8, '0')}`
    };
  }
  const soloDig = String(numeroStr || '').replace(/\D/g, '');
  if (soloDig) {
    return {
      ptoVta: 1,
      nroCmp: Number(soloDig) || 1,
      formateado: `0001-${soloDig.padStart(8, '0')}`
    };
  }
  return { ptoVta: 1, nroCmp: 1, formateado: '0001-00000001' };
}

function codificarBase64Utf8(str) {
  try {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  } catch {
    return btoa(unescape(encodeURIComponent(str)));
  }
}

async function generarQrArcaDataUrl({
  fechaISO,
  cuitEmisor,
  ptoVta,
  tipoCmp,
  nroCmp,
  importe,
  receptorDoc,
  cae
}) {
  const docLimpio = String(receptorDoc || '').replace(/\D/g, '');
  const tipoDocRec = docLimpio.length === 11 ? 80 : docLimpio.length >= 7 ? 96 : 99;
  const nroDocRec = docLimpio ? Number(docLimpio) : 0;

  const payload = {
    ver: 1,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO || '')) ? fechaISO : getHoyISO(),
    cuit: Number(cleanCUIT(cuitEmisor)) || 0,
    ptoVta: Number(ptoVta) || 1,
    tipoCmp: Number(tipoCmp) || 11,
    nroCmp: Number(nroCmp) || 1,
    importe: Math.round((Number(importe) || 0) * 100) / 100,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec,
    nroDocRec,
    tipoCodAut: 'E',
    codAut: Number(String(cae || '0').replace(/\D/g, '')) || 0
  };

  const urlQr = `https://www.arca.gob.ar/fe/qr/?p=${codificarBase64Utf8(JSON.stringify(payload))}`;
  return QRCode.toDataURL(urlQr, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#FFFFFF' }
  });
}

function obtenerDimensionesLogo(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof Image === 'undefined') {
      resolve({ w: 1, h: 1 });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

function dibujarDecoracionSuperior(doc, estilo, rgb, rgbSoft, rgbMid) {
  const W = 210;
  if (estilo === 'ondas') {
    // Onda suave secundaria
    doc.setFillColor(...rgbMid);
    doc.lines(
      [
        [70, 14, 140, -6, W, 10],
        [0, -28],
        [-W, 0]
      ],
      0,
      20,
      [1, 1],
      'F',
      true
    );
    // Onda principal superior
    doc.setFillColor(...rgb);
    doc.lines(
      [
        [65, -8, 135, 16, W, 4],
        [0, -18],
        [-W, 0]
      ],
      0,
      14,
      [1, 1],
      'F',
      true
    );
  } else if (estilo === 'minimalista') {
    // Línea divisoria fina en color principal
    doc.setFillColor(...rgb);
    doc.rect(14, 10, W - 28, 1.2, 'F');
  } else if (estilo === 'dinamico') {
    // Cinta diagonal moderna en encabezado superior derecho
    doc.setFillColor(...rgbSoft);
    doc.triangle(105, 0, W, 0, W, 38, 'F');
    doc.setFillColor(...rgb);
    doc.triangle(132, 0, W, 0, W, 28, 'F');
    doc.setFillColor(...rgb);
    doc.rect(0, 0, 5, 44, 'F');
  } else {
    // Clásico: acento sutil superior izquierdo + bloque superior redondeado se dibuja en cabecera
    doc.setFillColor(...rgb);
    doc.rect(0, 0, W, 4, 'F');
  }
}

function dibujarDecoracionInferior(doc, estilo, rgb, rgbSoft, rgbMid) {
  const W = 210;
  const H = 297;
  if (estilo === 'ondas') {
    doc.setFillColor(...rgbSoft);
    doc.lines(
      [
        [75, -14, 145, 8, W, -8],
        [0, 22],
        [-W, 0]
      ],
      0,
      H - 14,
      [1, 1],
      'F',
      true
    );
    doc.setFillColor(...rgb);
    doc.lines(
      [
        [65, 8, 140, -12, W, -3],
        [0, 14],
        [-W, 0]
      ],
      0,
      H - 8,
      [1, 1],
      'F',
      true
    );
  } else if (estilo === 'minimalista') {
    doc.setFillColor(...rgb);
    doc.rect(14, H - 12, 34, 2.2, 'F');
    doc.setFillColor(...rgbMid);
    doc.rect(50, H - 12, 12, 2.2, 'F');
    doc.setDrawColor(215, 220, 226);
    doc.setLineWidth(0.3);
    doc.line(14, H - 15, W - 14, H - 15);
  } else if (estilo === 'dinamico') {
    doc.setFillColor(...rgbSoft);
    doc.triangle(0, H, 0, H - 22, 115, H, 'F');
    doc.setFillColor(...rgb);
    doc.triangle(W, H, W, H - 18, 92, H, 'F');
  } else {
    // Clásico: barra inferior recta sólida
    doc.setFillColor(...rgb);
    doc.rect(0, H - 9, W, 9, 'F');
  }
}

function dibujarIconoSaludoCordial(doc, x, y, rgb) {
  // Ícono vectorial cálido (círculo de acento + check/sonrisa cordial) para estilo Dinámico
  doc.setFillColor(...rgb);
  doc.circle(x + 4, y + 4, 4, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.circle(x + 2.7, y + 3.2, 0.4, 'F');
  doc.circle(x + 5.3, y + 3.2, 0.4, 'F');
  doc.lines([[1.2, 1.3, 2.4, 1.3, 3.6, 0]], x + 2.2, y + 4.9, [1, 1], 'S');
}

/**
 * Motor unificado de generación de PDF para PRESUPUESTO y FACTURA ARCA.
 * Respeta el logotipo del cliente, el estilo de plantilla (1 a 4) y el color principal elegido.
 */
export async function generarComprobantePDF({
  tipo = 'PRESUPUESTO',
  cliente = {},
  receptor = {},
  items = [],
  observaciones = '',
  validezDias = 15,
  arcaData = {},
  diseno = {}
}) {
  const esPresupuesto = String(tipo || 'PRESUPUESTO').toUpperCase() === 'PRESUPUESTO';
  const cfgDiseno = { ...DISENO_DEFAULT, ...(diseno || {}) };
  const estilo = ['clasico', 'ondas', 'minimalista', 'dinamico'].includes(cfgDiseno.estilo)
    ? cfgDiseno.estilo
    : 'clasico';

  const rgb = hexToRgb(cfgDiseno.colorPrincipal);
  const rgbSoft = mezclarConBlanco(rgb, 0.91);
  const rgbMid = mezclarConBlanco(rgb, 0.72);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 14;

  // 1. Decoración superior según estilo
  dibujarDecoracionSuperior(doc, estilo, rgb, rgbSoft, rgbMid);

  // 2. Metadatos de tipo de documento
  const fechaEmisionISO = arcaData?.fecha || getHoyISO();
  const fechaEmisionAR = formatFechaAR(fechaEmisionISO);
  const metaArca = resolverMetadatosArca(arcaData?.tipoComprobante || 'Factura C', arcaData);
  const nroParseado = esPresupuesto
    ? { formateado: arcaData?.numeroComprobante || 'P-0001-00000001', ptoVta: 1, nroCmp: 1 }
    : parsearPtoVtaYNro(arcaData?.numeroComprobante || '0001-00000001');

  const yHeaderTop = estilo === 'ondas' ? 24 : 15;

  // 3. Bloque izquierdo: Logotipo + Datos del emisor
  let yEmisor = yHeaderTop;
  if (cfgDiseno.logoDataUrl && cfgDiseno.logoDataUrl.startsWith('data:image/')) {
    try {
      const dims = await obtenerDimensionesLogo(cfgDiseno.logoDataUrl);
      const maxW = 38;
      const maxH = 18;
      const scale = Math.min(maxW / dims.w, maxH / dims.h);
      const drawW = Math.max(8, dims.w * scale);
      const drawH = Math.max(6, dims.h * scale);
      const fmt = cfgDiseno.logoDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(cfgDiseno.logoDataUrl, fmt, M, yEmisor, drawW, drawH, undefined, 'FAST');
      yEmisor += drawH + 3.5;
    } catch {
      // Continuar sin logo si el dataUrl falla
    }
  }

  const nombreEmisor =
    String(cfgDiseno.nombreComercial || cliente?.NombreFantasia || cliente?.Cliente || 'Contribuyente').trim();
  const razonSocialEmisor = String(cliente?.Cliente || nombreEmisor).trim();
  const cuitEmisor = formatCUIT(cliente?.CUIT || '00000000000');
  const domicilioEmisor =
    String(cfgDiseno.domicilioComercial || (cliente?.Localidad ? `${cliente.Localidad}, Argentina` : 'Salta, Argentina')).trim();
  const iibbEmisor = String(cfgDiseno.ingresosBrutos || cleanCUIT(cliente?.CUIT) || '-').trim();
  const inicioActEmisor = String(cfgDiseno.inicioActividades || '-').trim();
  const condIvaEmisor = String(cfgDiseno.condicionIva || 'Responsable Monotributo').trim();

  doc.setTextColor(...rgb);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  const lineasNom = doc.splitTextToSize(nombreEmisor, 74);
  doc.text(lineasNom, M, yEmisor + 4);
  yEmisor += lineasNom.length * 5.2 + 1.5;

  doc.setTextColor(60, 68, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  if (razonSocialEmisor && razonSocialEmisor.toLowerCase() !== nombreEmisor.toLowerCase()) {
    doc.text(`Razón Social: ${razonSocialEmisor}`, M, yEmisor);
    yEmisor += 4;
  }
  doc.text(`Domicilio: ${domicilioEmisor}`, M, yEmisor);
  yEmisor += 4;
  doc.text(`Condición IVA: ${condIvaEmisor}`, M, yEmisor);
  yEmisor += 4;
  if (!esPresupuesto) {
    doc.text(`CUIT: ${cuitEmisor}  •  IIBB: ${iibbEmisor}`, M, yEmisor);
    yEmisor += 4;
    doc.text(`Inicio de Actividades: ${inicioActEmisor}`, M, yEmisor);
    yEmisor += 4;
  } else {
    doc.text(`CUIT: ${cuitEmisor}`, M, yEmisor);
    yEmisor += 4;
  }

  // 4. Recuadro central reglamentario (Letra X para Presupuesto / Letra C, A o B + COD para Factura)
  const boxCenterX = W / 2 - 9;
  const boxCenterY = yHeaderTop;
  const boxW = 18;
  const boxH = 19;

  if (estilo === 'clasico' || estilo === 'dinamico') {
    doc.setFillColor(...rgb);
    doc.roundedRect(boxCenterX, boxCenterY, boxW, boxH, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setFillColor(...rgbSoft);
    doc.setDrawColor(...rgb);
    doc.setLineWidth(0.7);
    doc.roundedRect(boxCenterX, boxCenterY, boxW, boxH, 2, 2, 'FD');
    doc.setTextColor(...rgb);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(esPresupuesto ? 'X' : metaArca.letra, W / 2, boxCenterY + 10.5, { align: 'center' });
  doc.setFontSize(6.2);
  doc.text(
    esPresupuesto ? 'PRESUP.' : `COD. ${metaArca.codigo}`,
    W / 2,
    boxCenterY + 15.8,
    { align: 'center' }
  );

  // 5. Bloque derecho: Tipo, Número, Fecha, Validez o Datos Fiscales
  const rightX = W / 2 + 14;
  const rightW = W - M - rightX;
  let yDerecha = yHeaderTop;

  if (estilo === 'clasico') {
    // Bloque superior redondeado sólido para tipo y número
    doc.setFillColor(...rgb);
    doc.roundedRect(rightX, yDerecha, rightW, 17, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(esPresupuesto ? 'PRESUPUESTO' : metaArca.titulo, rightX + 4, yDerecha + 7.2);
    doc.setFontSize(9.5);
    doc.text(`N° ${nroParseado.formateado}`, rightX + 4, yDerecha + 13.5);
    yDerecha += 21.5;
  } else if (estilo === 'ondas') {
    doc.setFillColor(...rgbSoft);
    doc.roundedRect(rightX, yDerecha, rightW, 17, 4, 4, 'F');
    doc.setTextColor(...rgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(esPresupuesto ? 'PRESUPUESTO' : metaArca.titulo, rightX + 4, yDerecha + 7.2);
    doc.setFontSize(9.5);
    doc.text(`N° ${nroParseado.formateado}`, rightX + 4, yDerecha + 13.5);
    yDerecha += 21.5;
  } else if (estilo === 'dinamico') {
    doc.setTextColor(...rgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(esPresupuesto ? 'PRESUPUESTO' : metaArca.titulo, rightX, yDerecha + 6.5);
    doc.setFontSize(9.5);
    doc.setTextColor(31, 41, 55);
    doc.text(`N° ${nroParseado.formateado}`, rightX, yDerecha + 12.5);
    yDerecha += 17.5;
  } else {
    // Minimalista
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.text(esPresupuesto ? 'PRESUPUESTO' : metaArca.titulo, rightX, yDerecha + 6.5);
    doc.setFontSize(9.5);
    doc.setTextColor(...rgb);
    doc.text(`N° ${nroParseado.formateado}`, rightX, yDerecha + 12.2);
    yDerecha += 17;
  }

  doc.setTextColor(55, 65, 81);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Fecha de Emisión: ${fechaEmisionAR}`, rightX, yDerecha);
  yDerecha += 4.5;

  if (esPresupuesto) {
    const diasVal = Math.max(1, Number(validezDias) || 15);
    const fechaVtoOferta = formatFechaAR(sumarDiasFechaISO(fechaEmisionISO, diasVal));
    doc.text(`Validez de oferta: ${diasVal} días (hasta ${fechaVtoOferta})`, rightX, yDerecha);
    yDerecha += 5;

    // Leyenda visible obligatoria para Presupuestos
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.35);
    doc.roundedRect(rightX, yDerecha - 1.2, rightW, 6.8, 1.5, 1.5, 'FD');
    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.text('Documento no válido como factura', rightX + rightW / 2, yDerecha + 3.2, { align: 'center' });
    yDerecha += 9;
  } else {
    doc.text(`Punto de Venta: ${String(nroParseado.ptoVta).padStart(4, '0')}`, rightX, yDerecha);
    yDerecha += 4.3;
    if (arcaData?.condicionVenta) {
      doc.text(`Condición de venta: ${arcaData.condicionVenta}`, rightX, yDerecha);
      yDerecha += 4.3;
    }
    if (arcaData?.fechaDesde && arcaData?.fechaHasta) {
      doc.text(
        `Período: ${formatFechaAR(arcaData.fechaDesde)} al ${formatFechaAR(arcaData.fechaHasta)}`,
        rightX,
        yDerecha
      );
      yDerecha += 4.3;
    }
  }

  let cursorY = Math.max(yEmisor, yDerecha) + 3;

  // Separador horizontal
  doc.setDrawColor(...(estilo === 'minimalista' ? [209, 213, 219] : rgbMid));
  doc.setLineWidth(estilo === 'minimalista' ? 0.3 : 0.6);
  doc.line(M, cursorY, W - M, cursorY);
  cursorY += 5;

  // 6. Bloque de Datos del Receptor
  const recNombre = String(receptor?.nombre || receptor?.receptorNombre || 'Consumidor Final').trim();
  const recDoc = String(receptor?.documento || receptor?.cuit || receptor?.receptorDocumento || '').trim();
  const recDom = String(receptor?.domicilio || '').trim();
  const recCondIva = String(
    receptor?.condicionIva || (recDoc.replace(/\D/g, '').length === 11 ? 'Responsable / Monotributo' : 'Consumidor Final')
  ).trim();

  const recBoxH = recDom ? 20 : 15.5;
  doc.setFillColor(...(estilo === 'minimalista' ? [248, 250, 252] : rgbSoft));
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, cursorY, W - M * 2, recBoxH, 2.5, 2.5, 'FD');

  doc.setTextColor(...rgb);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.text(esPresupuesto ? 'DATOS DEL CLIENTE' : 'DATOS DEL RECEPTOR', M + 3.5, cursorY + 4.8);

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.text(recNombre, M + 3.5, cursorY + 10.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  const docTexto = recDoc
    ? `${recDoc.replace(/\D/g, '').length === 11 ? 'CUIT' : 'DNI'}: ${
        recDoc.replace(/\D/g, '').length === 11 ? formatCUIT(recDoc) : recDoc
      }`
    : 'Documento: Consumidor Final';
  doc.text(`${docTexto}  •  Condición: ${recCondIva}`, W - M - 3.5, cursorY + 10.2, { align: 'right' });

  if (recDom) {
    doc.setTextColor(71, 85, 105);
    doc.text(`Domicilio: ${recDom}`, M + 3.5, cursorY + 15.6);
  }

  cursorY += recBoxH + 6;

  // 7. Tabla de Ítems
  const itemsNorm = (Array.isArray(items) && items.length > 0 ? items : [
    {
      descripcion: arcaData?.descripcion || 'Servicios profesionales',
      cantidad: 1,
      precioUnitario: Number(arcaData?.importe) || 0
    }
  ]).map((it) => {
    const cant = Math.max(0.01, Number(it.cantidad) || 1);
    const pu = Math.max(0, Number(it.precioUnitario) || 0);
    return {
      descripcion: String(it.descripcion || 'Ítem').trim(),
      cantidad: cant,
      precioUnitario: pu,
      subtotal: Math.round(cant * pu * 100) / 100
    };
  });

  const colDescX = M + 3;
  const colCantX = 128;
  const colPuX = 158;
  const colSubX = W - M - 3;

  // Encabezado de tabla (minimalista usa tono oscuro neutro, los demás el color principal)
  const tableHeaderRgb = estilo === 'minimalista' ? [31, 41, 55] : rgb;
  doc.setFillColor(...tableHeaderRgb);
  doc.roundedRect(M, cursorY, W - M * 2, 8.2, 1.8, 1.8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text('DESCRIPCIÓN', colDescX, cursorY + 5.4);
  doc.text('CANT.', colCantX, cursorY + 5.4, { align: 'right' });
  doc.text('P. UNITARIO', colPuX, cursorY + 5.4, { align: 'right' });
  doc.text('SUBTOTAL', colSubX, cursorY + 5.4, { align: 'right' });
  cursorY += 9.5;

  let totalGeneral = 0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);

  const limiteYTabla = esPresupuesto ? 226 : 212;

  itemsNorm.forEach((it, idx) => {
    totalGeneral += it.subtotal;
    const lineasDesc = doc.splitTextToSize(it.descripcion, 102);
    const altoFila = Math.max(7.5, lineasDesc.length * 4.4 + 3);

    if (cursorY + altoFila > limiteYTabla) {
      doc.addPage();
      dibujarDecoracionSuperior(doc, estilo, rgb, rgbSoft, rgbMid);
      cursorY = 26;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, cursorY - 1, W - M * 2, altoFila, 'F');
    }

    doc.setTextColor(30, 41, 59);
    doc.text(lineasDesc, colDescX, cursorY + 3.5);
    doc.text(String(it.cantidad), colCantX, cursorY + 3.5, { align: 'right' });
    doc.text(formatARS(it.precioUnitario), colPuX, cursorY + 3.5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatARS(it.subtotal), colSubX, cursorY + 3.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    doc.setDrawColor(232, 236, 241);
    doc.setLineWidth(0.2);
    doc.line(M, cursorY + altoFila - 1, W - M, cursorY + altoFila - 1);
    cursorY += altoFila;
  });

  cursorY += 5;

  // 8. Bloque de Totales + Observaciones
  const totalBoxW = 76;
  const totalBoxX = W - M - totalBoxW;
  const totalBoxH = 18;

  // Observaciones a la izquierda
  const obsTexto = String(observaciones || '').trim();
  if (obsTexto || estilo === 'dinamico') {
    const obsW = totalBoxX - M - 6;
    const obsX = M;
    const textoFinalObs =
      obsTexto || (esPresupuesto ? 'Gracias por su consulta. Quedamos a disposición.' : 'Gracias por su confianza.');
    const lineasObs = doc.splitTextToSize(textoFinalObs, estilo === 'dinamico' ? obsW - 14 : obsW - 6);
    const altoObs = Math.max(totalBoxH, lineasObs.length * 4.2 + 9);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(obsX, cursorY, obsW, altoObs, 2.5, 2.5, 'FD');

    let textObsX = obsX + 3.5;
    if (estilo === 'dinamico') {
      dibujarIconoSaludoCordial(doc, obsX + 3, cursorY + 4.5, rgb);
      textObsX = obsX + 13;
    }

    doc.setTextColor(...rgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.text(
      esPresupuesto ? 'CONDICIONES / OBSERVACIONES' : 'OBSERVACIONES',
      textObsX,
      cursorY + 5
    );
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(lineasObs, textObsX, cursorY + 9.5);
  }

  // Caja de Total General a la derecha
  if (estilo === 'ondas') {
    doc.setFillColor(...rgbSoft);
    doc.setDrawColor(...rgb);
    doc.setLineWidth(0.6);
    doc.roundedRect(totalBoxX, cursorY, totalBoxW, totalBoxH, 4.5, 4.5, 'FD');
    doc.setTextColor(...rgb);
  } else {
    doc.setFillColor(...rgb);
    doc.roundedRect(totalBoxX, cursorY, totalBoxW, totalBoxH, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text('IMPORTE TOTAL', totalBoxX + 4.5, cursorY + 6.2);
  doc.setFontSize(14.5);
  doc.text(formatARS(totalGeneral), totalBoxX + totalBoxW - 4.5, cursorY + 13.8, { align: 'right' });

  // 9. Pie reglamentario ARCA (QR + CAE + Vto. CAE) para FACTURA, o cierre cordial para PRESUPUESTO
  if (!esPresupuesto) {
    const yArca = 240;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.roundedRect(M, yArca, W - M * 2, 36, 3, 3, 'FD');

    const caeValor = String(arcaData?.cae || 'Pendiente de autorización').trim();
    const vtoCaeValor = arcaData?.vtoCae ? formatFechaAR(arcaData.vtoCae) : '-';

    try {
      const qrDataUrl = await generarQrArcaDataUrl({
        fechaISO: fechaEmisionISO,
        cuitEmisor: cliente?.CUIT,
        ptoVta: nroParseado.ptoVta,
        tipoCmp: metaArca.codigoNum,
        nroCmp: nroParseado.nroCmp,
        importe: totalGeneral,
        receptorDoc: recDoc,
        cae: caeValor
      });
      doc.addImage(qrDataUrl, 'PNG', M + 3.5, yArca + 3, 30, 30, undefined, 'FAST');
    } catch {
      // Si falla generación QR no romper el PDF
    }

    const xInfoArca = M + 38;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('ARCA — Comprobante Autorizado', xInfoArca, yArca + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(71, 85, 105);
    doc.text(
      'Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación.',
      xInfoArca,
      yArca + 14.5,
      { maxWidth: 138 }
    );

    doc.setTextColor(...rgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`CAE N°: ${caeValor}`, xInfoArca, yArca + 24.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`Fecha de Vto. de CAE: ${vtoCaeValor}`, xInfoArca, yArca + 30.2);
  } else {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text(
      'Presupuesto orientativo — Documento no válido como factura ni como comprobante fiscal.',
      W / 2,
      276,
      { align: 'center' }
    );
  }

  // 10. Decoración inferior según estilo
  dibujarDecoracionInferior(doc, estilo, rgb, rgbSoft, rgbMid);

  const blob = doc.output('blob');
  const prefijo = esPresupuesto ? 'Presupuesto' : metaArca.titulo.replace(/\s+/g, '_');
  const numLimpio = nroParseado.formateado.replace(/[^a-zA-Z0-9-]/g, '');
  const filename = `${prefijo}_${numLimpio}.pdf`;

  return { blob, filename, doc, total: totalGeneral };
}
