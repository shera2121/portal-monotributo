import { formatARS, formatCUIT, formatFechaAR } from './fiscalCalculations.js';

/**
 * Sanitiza texto a ASCII seguro para PDF Helvetica estándar (sin librerías externas pesadas)
 */
function limpiarTextoPdf(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()\\]/g, (m) => `\\${m}`)
    .replace(/[^\x20-\x7E]/g, ' ');
}

/**
 * Genera un Blob PDF 1.4 válido y liviano con encabezado institucional GR Estudio Digital
 */
export function generarPdfResumenBlob({ titulo, subtitulo, lineas = [], pie = '' }) {
  const cmds = [];
  // Barra superior Azul Petróleo (#0F4C5C -> 0.059 0.298 0.361)
  cmds.push('0.059 0.298 0.361 rg');
  cmds.push('0 755 595 87 re f');
  // Franja acento Naranja Ladrillo (#E36414 -> 0.89 0.392 0.078)
  cmds.push('0.89 0.392 0.078 rg');
  cmds.push('0 750 595 5 re f');

  // Título en cabecera
  cmds.push('1 1 1 rg');
  cmds.push('BT /F2 17 Tf 42 806 Td (GR ESTUDIO IMPOSITIVO DIGITAL) Tj ET');
  cmds.push('BT /F1 11 Tf 42 786 Td (GR Servicios Contables - Salta, Argentina) Tj ET');
  cmds.push(`BT /F2 12 Tf 42 766 Td (${limpiarTextoPdf(titulo)}) Tj ET`);

  // Subtítulo
  cmds.push('0.059 0.298 0.361 rg');
  cmds.push(`BT /F2 12 Tf 42 718 Td (${limpiarTextoPdf(subtitulo)}) Tj ET`);

  // Línea separadora
  cmds.push('0.85 0.88 0.91 RG 1 w 42 708 m 553 708 l S');

  // Contenido en filas
  let y = 684;
  lineas.forEach((linea) => {
    if (y < 90) return;
    if (typeof linea === 'string') {
      cmds.push('0.15 0.2 0.25 rg');
      cmds.push(`BT /F1 10.5 Tf 42 ${y} Td (${limpiarTextoPdf(linea)}) Tj ET`);
      y -= 20;
    } else {
      cmds.push('0.35 0.42 0.49 rg');
      cmds.push(`BT /F2 9.5 Tf 42 ${y} Td (${limpiarTextoPdf(linea.etiqueta)}:) Tj ET`);
      cmds.push('0.08 0.12 0.18 rg');
      cmds.push(`BT /F1 10.5 Tf 205 ${y} Td (${limpiarTextoPdf(linea.valor)}) Tj ET`);
      y -= 22;
    }
  });

  // Pie institucional
  cmds.push('0.85 0.88 0.91 RG 0.8 w 42 66 m 553 66 l S');
  cmds.push('0.4 0.45 0.52 rg');
  cmds.push(
    `BT /F1 8.5 Tf 42 48 Td (${limpiarTextoPdf(
      pie || 'Documento generado desde Portal de Autogestion Monotributo - GR Estudio Digital'
    )}) Tj ET`
  );

  const stream = cmds.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    `6 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  });

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function generarPdfConstancia(cliente) {
  const c = cliente || {};
  return generarPdfResumenBlob({
    titulo: 'CONSTANCIA DE MONOTRIBUTO / INSCRIPCION',
    subtitulo: `Contribuyente: ${c.Cliente || 'Contribuyente'}`,
    lineas: [
      { etiqueta: 'CUIT', valor: formatCUIT(c.CUIT) },
      { etiqueta: 'Categoria Vigente', valor: `Categoria ${c.Categoria_Actual || 'A'}` },
      { etiqueta: 'Actividad', valor: c.Actividad || 'Servicios' },
      { etiqueta: 'Jurisdiccion', valor: c.Localidad || 'Salta' },
      { etiqueta: 'Cuota Mensual', valor: formatARS(c.Importe_Cuota) },
      { etiqueta: 'Fecha de Emision', valor: formatFechaAR(c.constanciaDisponible?.fechaEmision || new Date().toISOString().slice(0, 10)) },
      { etiqueta: 'Vigencia Estimada', valor: formatFechaAR(c.constanciaDisponible?.vigenciaHasta || '') },
      ' ',
      'Valido como constancia de respaldo digital remitida por GR Estudio Impositivo Digital.',
      'En modo produccion, este enlace descarga el PDF oficial emitido desde ARCA.'
    ]
  });
}

export function generarPdfComprobante(item, tipoSeccion, cliente) {
  if (tipoSeccion === 'ventas') {
    return generarPdfResumenBlob({
      titulo: `${item.tipoComprobante || 'COMPROBANTE DE VENTA'}`,
      subtitulo: `Nro: ${item.numeroComprobante || 'En tramite'}`,
      lineas: [
        { etiqueta: 'Emisor', valor: `${cliente?.Cliente || ''} (CUIT ${formatCUIT(cliente?.CUIT)})` },
        { etiqueta: 'Fecha', valor: formatFechaAR(item.fecha) },
        { etiqueta: 'Concepto', valor: item.concepto || 'Servicios' },
        { etiqueta: 'Receptor', valor: `${item.receptorNombre || item.receptorTipo}${item.receptorDocumento ? ` (${item.receptorDocumento})` : ''}` },
        { etiqueta: 'Condicion de Venta', valor: item.condicionVenta || '-' },
        { etiqueta: 'Importe Total', valor: formatARS(item.importe) },
        { etiqueta: 'Estado', valor: item.estado || 'Solicitada' },
        { etiqueta: 'CAE', valor: item.cae || 'Pendiente de emision por el estudio' },
        { etiqueta: 'Descripcion', valor: item.descripcion || '-' }
      ]
    });
  }

  return generarPdfResumenBlob({
    titulo: 'RESPALDO DE COMPROBANTE DE COMPRA / GASTO',
    subtitulo: item.proveedor || 'Proveedor',
    lineas: [
      { etiqueta: 'Contribuyente', valor: `${cliente?.Cliente || ''} (CUIT ${formatCUIT(cliente?.CUIT)})` },
      { etiqueta: 'Clasificacion', valor: item.clasificacion || '-' },
      { etiqueta: 'Fecha', valor: formatFechaAR(item.fecha) },
      { etiqueta: 'Nro. Comprobante', valor: item.numeroComprobante || '-' },
      { etiqueta: 'Importe Total', valor: formatARS(item.importe) },
      { etiqueta: 'Estado en Estudio', valor: item.estado || 'En revision' },
      { etiqueta: 'Archivo', valor: item.archivoNombre || 'Adjunto digital' },
      { etiqueta: 'Observacion', valor: item.observacion || '-' },
      ...(item.motivoObservacion ? [{ etiqueta: 'Nota del Estudio', valor: item.motivoObservacion }] : [])
    ]
  });
}

export function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Comparte un archivo (PDF o imagen) o texto usando navigator.share (WhatsApp / Android / iOS)
 * con respaldo automático de descarga o portapapeles.
 */
export async function compartirDocumento({ titulo, texto, url, blob, nombreArchivo }) {
  try {
    if (blob && typeof File !== 'undefined' && navigator.share) {
      const file = new File([blob], nombreArchivo || 'documento.pdf', { type: blob.type || 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: titulo, text: texto, files: [file] });
        return { shared: true, method: 'native-file' };
      }
    }

    if (navigator.share) {
      await navigator.share({
        title: titulo,
        text: texto,
        ...(url ? { url } : {})
      });
      return { shared: true, method: 'native-text' };
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { shared: false, cancelled: true };
    }
  }

  // Fallback escritorio / navegadores sin Web Share API: descargar PDF o copiar texto
  if (blob) {
    descargarBlob(blob, nombreArchivo || 'documento.pdf');
    return { shared: true, method: 'download-fallback' };
  }
  if (navigator.clipboard && texto) {
    await navigator.clipboard.writeText(`${titulo}\n${texto}${url ? `\n${url}` : ''}`);
    return { shared: true, method: 'clipboard-fallback' };
  }
  return { shared: false, method: 'none' };
}
