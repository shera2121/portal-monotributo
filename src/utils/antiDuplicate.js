import { parseMontoSeguro, formatARS, formatFechaAR } from './fiscalCalculations.js';

const normalizarTexto = (txt) =>
  String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

const normalizarNumeroComprobante = (num) =>
  String(num || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '')
    .trim();

/**
 * VALIDADOR ANTI-DUPLICADOS EN TIEMPO REAL
 * Compara el comprobante en carga contra el historial de Compras/Gastos por 3 reglas:
 *  1. Mismo nombre y tamaño de archivo reciente.
 *  2. Misma Fecha + Importe exacto.
 *  3. Mismo Emisor/CUIT + Número de Comprobante.
 */
export function detectarComprobanteDuplicado(candidato, historialCompras = []) {
  if (!Array.isArray(historialCompras) || historialCompras.length === 0) {
    return { isDuplicate: false, regla: null, motivo: '', matchedReceipt: null };
  }

  const archivoNombreCand = String(candidato.archivoNombre || '').trim().toLowerCase();
  const archivoTamanoCand = Number(candidato.archivoTamano || 0);
  const fechaCand = String(candidato.fecha || '').trim();
  const importeCand = Math.round(parseMontoSeguro(candidato.importe, 0) * 100);
  const emisorCand = normalizarTexto(candidato.proveedor || candidato.cuitEmisor);
  const numeroCand = normalizarNumeroComprobante(candidato.numeroComprobante);

  // Ignorar comprobantes ya marcados como "Duplicado" al buscar el original si hay otro válido,
  // pero igual ordenar dando prioridad a Registrado / En revisión.
  const ordenado = [...historialCompras].sort((a, b) => {
    const peso = (e) => (e === 'Registrado' ? 0 : e === 'En revisión' ? 1 : 2);
    return peso(a.estado) - peso(b.estado);
  });

  // REGLA 1: Mismo nombre y tamaño de archivo reciente
  if (archivoNombreCand && archivoTamanoCand > 0) {
    const matchArchivo = ordenado.find((item) => {
      const nombreItem = String(item.archivoNombre || '').trim().toLowerCase();
      const tamanoItem = Number(item.archivoTamano || 0);
      return nombreItem === archivoNombreCand && tamanoItem > 0 && Math.abs(tamanoItem - archivoTamanoCand) <= 1024;
    });

    if (matchArchivo) {
      return {
        isDuplicate: true,
        regla: 'ARCHIVO_IDENTICO',
        motivo: `Ya subiste un archivo idéntico ("${matchArchivo.archivoNombre}") con el mismo tamaño.`,
        matchedReceipt: matchArchivo
      };
    }
  }

  // REGLA 3: Mismo Emisor/CUIT + Número de Comprobante
  if (emisorCand.length >= 3 && numeroCand.length >= 3) {
    const matchEmisorNumero = ordenado.find((item) => {
      const emisorItem = normalizarTexto(item.proveedor);
      const cuitItem = normalizarTexto(item.cuitEmisor);
      const numeroItem = normalizarNumeroComprobante(item.numeroComprobante);
      if (!numeroItem || numeroItem !== numeroCand) return false;
      const emisorCoincide =
        (emisorItem && (emisorItem.includes(emisorCand) || emisorCand.includes(emisorItem))) ||
        (cuitItem && (cuitItem === emisorCand || emisorCand.includes(cuitItem)));
      return emisorCoincide;
    });

    if (matchEmisorNumero) {
      return {
        isDuplicate: true,
        regla: 'EMISOR_Y_NUMERO',
        motivo: `Ya existe un comprobante de "${matchEmisorNumero.proveedor}" con el número ${matchEmisorNumero.numeroComprobante}.`,
        matchedReceipt: matchEmisorNumero
      };
    }
  }

  // REGLA 2: Misma Fecha + Importe exacto
  if (fechaCand && importeCand > 0) {
    const matchFechaImporte = ordenado.find((item) => {
      const fechaItem = String(item.fecha || '').trim();
      const importeItem = Math.round(parseMontoSeguro(item.importe, 0) * 100);
      return fechaItem === fechaCand && importeItem === importeCand;
    });

    if (matchFechaImporte) {
      return {
        isDuplicate: true,
        regla: 'FECHA_E_IMPORTE',
        motivo: `Ya existe un comprobante cargado con fecha ${formatFechaAR(matchFechaImporte.fecha)} por exactamente ${formatARS(matchFechaImporte.importe)}.`,
        matchedReceipt: matchFechaImporte
      };
    }
  }

  return { isDuplicate: false, regla: null, motivo: '', matchedReceipt: null };
}
