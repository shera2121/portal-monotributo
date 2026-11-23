/**
 * ============================================================================
 * PARSER INTELIGENTE DE DICTADO POR VOZ — ESPAÑOL ARGENTINA (es-AR)
 * ============================================================================
 * Interpreta frases naturales dictadas por voz para:
 *  1) Solicitudes de Factura C / Nota de Crédito C (parsearDictadoFactura)
 *  2) Carga de Comprobantes de Compras / Gastos (parsearDictadoComprobante)
 */

const MESES_ES = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12
};

const PALABRAS_NUM = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900
};

function sinTildes(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function aISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Convierte expresiones habladas como "ciento veinte mil", "45 mil 800",
 * "un millón quinientos mil", "$ 120.000", "45.800,50", "85000" a número.
 */
export function extraerImporteAR(textoOriginal) {
  if (!textoOriginal) return null;
  const limpio = sinTildes(textoOriginal).toLowerCase();

  // 1. Formato mixto muy común en dictado AR: "45 mil 800", "120 mil", "1 millon 200 mil", "2 millones 500 mil"
  const mixtoMillon = limpio.match(
    /(?:(\d+(?:[.,]\d+)?)|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*millon(?:es)?(?:\s+(\d{1,3})\s*mil)?(?:\s+(\d{1,3}))?/
  );
  if (mixtoMillon) {
    const baseWord = mixtoMillon[0].split(/\s+/)[0];
    const baseNum = /^\d/.test(baseWord)
      ? parseFloat(baseWord.replace(',', '.'))
      : PALABRAS_NUM[baseWord] || 1;
    const miles = mixtoMillon[2] ? parseInt(mixtoMillon[2], 10) * 1000 : 0;
    const resto = mixtoMillon[3] ? parseInt(mixtoMillon[3], 10) : 0;
    return Math.round((baseNum * 1000000 + miles + resto) * 100) / 100;
  }

  const mixtoMil = limpio.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*mil(?:\s+(\d{1,3}))?/);
  if (mixtoMil) {
    const miles = parseFloat(mixtoMil[1].replace(',', '.')) * 1000;
    const resto = mixtoMil[2] ? parseInt(mixtoMil[2], 10) : 0;
    return Math.round((miles + resto) * 100) / 100;
  }

  // 2. Número escrito con separadores o directo (preferir los acompañados de "$" o "pesos")
  const conMoneda =
    limpio.match(/\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/) ||
    limpio.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:pesos|ars|pe\b)/);
  if (conMoneda) {
    return parsearNumeroAR(conMoneda[1]);
  }

  // 3. Frases enteramente en palabras (ej: "ciento veinte mil", "cuarenta y cinco mil ochocientos")
  const tokens = limpio
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let totalPalabras = 0;
  let grupoActual = 0;
  let encontroPalabraNum = false;
  let huboMultiplicador = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === 'y' && encontroPalabraNum) continue;
    if (PALABRAS_NUM[t] !== undefined) {
      grupoActual += PALABRAS_NUM[t];
      encontroPalabraNum = true;
    } else if (t === 'mil') {
      totalPalabras += (grupoActual || 1) * 1000;
      grupoActual = 0;
      encontroPalabraNum = true;
      huboMultiplicador = true;
    } else if (t === 'millon' || t === 'millones') {
      totalPalabras += (grupoActual || 1) * 1000000;
      grupoActual = 0;
      encontroPalabraNum = true;
      huboMultiplicador = true;
    } else if (encontroPalabraNum && huboMultiplicador) {
      break;
    } else if (encontroPalabraNum && !huboMultiplicador) {
      // Reiniciar si solo era una palabra suelta como "un servicio"
      totalPalabras = 0;
      grupoActual = 0;
      encontroPalabraNum = false;
    }
  }
  if (encontroPalabraNum && (huboMultiplicador || totalPalabras + grupoActual >= 100)) {
    return totalPalabras + grupoActual;
  }

  // 4. Último recurso: cualquier número suelto plausible (evitando años 2020-2035 o fechas cortas <= 31 si hay mes)
  const todosNumeros = [...limpio.matchAll(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{3,9}(?:,\d{1,2})?)\b/g)];
  for (const m of todosNumeros) {
    const val = parsearNumeroAR(m[1]);
    if (val && val >= 50 && !(val >= 2020 && val <= 2035 && !m[1].includes('.'))) {
      return val;
    }
  }

  return null;
}

function parsearNumeroAR(str) {
  let s = String(str || '').trim();
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/**
 * Extrae fecha en español argentino: "hoy", "ayer", "anteayer", "15 de noviembre", "15/11/2026"
 */
export function extraerFechaAR(textoOriginal, fechaReferencia = new Date()) {
  const limpio = sinTildes(textoOriginal).toLowerCase();

  if (/\banteayer\b/.test(limpio)) {
    const d = new Date(fechaReferencia);
    d.setDate(d.getDate() - 2);
    return aISO(d);
  }
  if (/\bayer\b/.test(limpio)) {
    const d = new Date(fechaReferencia);
    d.setDate(d.getDate() - 1);
    return aISO(d);
  }
  if (/\bhoy\b/.test(limpio)) {
    return aISO(fechaReferencia);
  }

  // "15 de noviembre" o "15 de noviembre de 2026"
  const matchTexto = limpio.match(
    /\b(\d{1,2})\s+de\s+(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|setiembre|sep|set|octubre|oct|noviembre|nov|diciembre|dic)(?:\s+(?:de|del)\s+(\d{4}))?\b/
  );
  if (matchTexto) {
    const dia = parseInt(matchTexto[1], 10);
    const mes = MESES_ES[matchTexto[2]];
    const anio = matchTexto[3] ? parseInt(matchTexto[3], 10) : fechaReferencia.getFullYear();
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }

  // "15/11/2026" o "15-11-26" o "15/11"
  const matchBarra = limpio.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (matchBarra) {
    const dia = parseInt(matchBarra[1], 10);
    const mes = parseInt(matchBarra[2], 10);
    let anio = fechaReferencia.getFullYear();
    if (matchBarra[3]) {
      anio = matchBarra[3].length === 2 ? 2000 + parseInt(matchBarra[3], 10) : parseInt(matchBarra[3], 10);
    }
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Extrae número de comprobante tipo "0012-00458912" o "factura 0012 00458912"
 */
function extraerNumeroComprobante(textoOriginal) {
  const limpio = sinTildes(textoOriginal).toLowerCase();

  // Patrón estándar con guion: 4-5 dígitos - 6-8 dígitos (o flexible 2-5 - 4-8)
  const matchGuion = textoOriginal.match(/\b(\d{2,5})\s*[-–]\s*(\d{4,8})\b/);
  if (matchGuion) {
    return {
      numero: `${matchGuion[1].padStart(4, '0')}-${matchGuion[2].padStart(8, '0')}`,
      raw: matchGuion[0]
    };
  }

  // Patrón hablado después de palabra clave: "factura 0012 00458912" o "comprobante número 458912"
  const matchHab = limpio.match(
    /(?:factura(?:\s+asociada|\s+c)?|comprobante|ticket|numero|nro\.?)\s*(?:numero|nro\.?)?\s*(\d{2,5})\s+(\d{4,8})\b/
  );
  if (matchHab) {
    return {
      numero: `${matchHab[1].padStart(4, '0')}-${matchHab[2].padStart(8, '0')}`,
      raw: matchHab[0]
    };
  }

  const matchSimple = limpio.match(
    /(?:factura(?:\s+asociada)?|comprobante|ticket)\s*(?:numero|nro\.?)?\s*(\d{4,12})\b/
  );
  if (matchSimple) {
    return {
      numero: matchSimple[1],
      raw: matchSimple[0]
    };
  }

  return null;
}

/**
 * 1. PARSER PARA FACTURACIÓN (Factura C / Nota de Crédito C)
 */
export function parsearDictadoFactura(textoOriginal) {
  const texto = String(textoOriginal || '').trim();
  const norm = sinTildes(texto).toLowerCase();
  const resultado = {
    textoOriginal: texto,
    camposDetectados: []
  };

  let textoParaImporte = texto;

  // Tipo de comprobante
  if (/nota\s+de\s+credito|\bnc\b/.test(norm)) {
    resultado.tipoComprobante = 'Nota de Crédito C';
    resultado.camposDetectados.push('Nota de Crédito C');
  } else if (/factura/.test(norm)) {
    resultado.tipoComprobante = 'Factura C';
    resultado.camposDetectados.push('Factura C');
  }

  // Factura asociada (especialmente si es Nota de Crédito)
  const compAsociado = extraerNumeroComprobante(texto);
  if (compAsociado && resultado.tipoComprobante === 'Nota de Crédito C') {
    resultado.facturaAsociada = compAsociado.numero;
    resultado.camposDetectados.push(`Factura asoc. ${compAsociado.numero}`);
    textoParaImporte = textoParaImporte.replace(compAsociado.raw, ' ');
  }

  // Concepto: Servicios vs Productos
  if (/\b(productos?|venta\s+de|mercaderia|articulos?|insumos?|bienes)\b/.test(norm)) {
    resultado.concepto = 'Productos';
    resultado.camposDetectados.push('Productos');
  } else if (/\b(servicios?|honorarios?|trabajo|consultoria|diseno|asesoramiento|mantenimiento|clases?)\b/.test(norm)) {
    resultado.concepto = 'Servicios';
    resultado.camposDetectados.push('Servicios');
  }

  // Receptor: Consumidor Final vs CUIT/DNI específico
  const cuitMatch = texto.match(/\b(\d{2})[-\s]?(\d{8})[-\s]?(\d)\b/);
  const dniMatch = norm.match(/\b(?:dni|documento|cuil|cuit)\s*(?:numero|nro\.?)?\s*([\d.\s-]{7,14})\b/);

  if (cuitMatch) {
    const soloDigitos = `${cuitMatch[1]}${cuitMatch[2]}${cuitMatch[3]}`;
    resultado.receptorTipo = 'CUIT / DNI específico';
    resultado.receptorDocumento = `${cuitMatch[1]}-${cuitMatch[2]}-${cuitMatch[3]}`;
    resultado.camposDetectados.push(`CUIT ${resultado.receptorDocumento}`);
    textoParaImporte = textoParaImporte.replace(cuitMatch[0], ' ');
    void soloDigitos;
  } else if (dniMatch) {
    const digitos = dniMatch[1].replace(/\D/g, '');
    if (digitos.length >= 7 && digitos.length <= 11) {
      resultado.receptorTipo = 'CUIT / DNI específico';
      resultado.receptorDocumento =
        digitos.length === 11
          ? `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`
          : digitos;
      resultado.camposDetectados.push(`Doc. ${resultado.receptorDocumento}`);
      textoParaImporte = textoParaImporte.replace(new RegExp(dniMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), ' ');
    }
  } else if (/consumidor\s+final/.test(norm)) {
    resultado.receptorTipo = 'Consumidor Final';
    resultado.camposDetectados.push('Consumidor Final');
  }

  // Condición de venta (quitar "nota de credito" para no confundir con "Tarjeta de Crédito")
  const normSinNC = norm.replace(/nota\s+de\s+credito/g, '');
  if (/transferencia|mercado\s*pago|\bmp\b|alias|\bcbu\b/.test(normSinNC)) {
    resultado.condicionVenta = 'Transferencia / Mercado Pago';
    resultado.camposDetectados.push('Transferencia / MP');
  } else if (/cuenta\s+corriente|cta\.?\s*cte\.?/.test(normSinNC)) {
    resultado.condicionVenta = 'Cuenta Corriente';
    resultado.camposDetectados.push('Cuenta Corriente');
  } else if (/debito/.test(normSinNC)) {
    resultado.condicionVenta = 'Tarjeta de Débito';
    resultado.camposDetectados.push('Débito');
  } else if (/tarjeta\s+de\s+credito|\bcredito\b/.test(normSinNC)) {
    resultado.condicionVenta = 'Tarjeta de Crédito';
    resultado.camposDetectados.push('Crédito');
  } else if (/efectivo|contado/.test(normSinNC)) {
    resultado.condicionVenta = 'Contado';
    resultado.camposDetectados.push('Contado');
  }

  // Importe
  const importe = extraerImporteAR(textoParaImporte);
  if (importe && importe > 0) {
    resultado.importe = importe;
    resultado.camposDetectados.push('Importe');
  }

  // Descripción limpia
  let desc = texto
    .replace(/\b(factura\s*c|nota\s+de\s+cr[eé]dito\s*c?)\b/gi, '')
    .replace(/\bfactura\s+asociada\s*(n[uú]mero|nro\.?)?\s*[\d\s-]{4,18}/gi, '')
    .replace(/\b(a\s+)?consumidor\s+final\b/gi, '')
    .replace(/\b(a\s+)?(cuit|cuil|dni|documento)\s*(n[uú]mero|nro\.?)?\s*[\d.\s-]{7,14}/gi, '')
    .replace(/\b(por|en|con)?\s*(transferencia|mercado\s*pago|efectivo|contado|tarjeta\s+de\s+d[eé]bito|tarjeta\s+de\s+cr[eé]dito|d[eé]bito|cr[eé]dito|cuenta\s+corriente)\b/gi, '')
    .replace(/\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s*(mil\s*\d{0,3})?\s*(pesos)?/gi, '')
    .replace(/^[,\s.;:-]+|[,\s.;:-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Quitar conectores sueltos al inicio o al final
  desc = desc.replace(/^(por|de|a|en|con)\b\s*/gi, '').replace(/\s*\b(por|de|a|en|con)$/gi, '').trim();

  const palabrasSignificativas = desc.split(/\s+/).filter((w) => w.length > 2);
  if (palabrasSignificativas.length === 0 || desc.length < 4) {
    desc =
      resultado.tipoComprobante === 'Nota de Crédito C' && resultado.facturaAsociada
        ? `Nota de Crédito sobre Factura C ${resultado.facturaAsociada}`
        : texto;
  } else {
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);
  }
  resultado.descripcion = desc;

  return resultado;
}

/**
 * 2. PARSER PARA CARGA DE COMPROBANTES (Compras / Gastos / Resúmenes / Tickets)
 */
export function parsearDictadoComprobante(textoOriginal) {
  const texto = String(textoOriginal || '').trim();
  const norm = sinTildes(texto).toLowerCase();
  const resultado = {
    textoOriginal: texto,
    camposDetectados: []
  };

  let textoParaImporte = texto;

  // Clasificación obligatoria
  if (/resumen|bancari[oa]|banco|extracto|mercado\s*pago/.test(norm)) {
    resultado.clasificacion = 'Resumen Bancario / Mercado Pago';
    resultado.camposDetectados.push('Resumen Bancario / MP');
  } else if (/compra|proveedor|mercaderia|insumos?|libreria|mayorista|ferreteria/.test(norm)) {
    resultado.clasificacion = 'Compra / Proveedor';
    resultado.camposDetectados.push('Compra / Proveedor');
  } else if (/ticket|combustible|nafta|ypf|shell|axion|peaje|estacionamiento|varios|otro/.test(norm)) {
    resultado.clasificacion = 'Ticket / Otro';
    resultado.camposDetectados.push('Ticket / Otro');
  } else if (/gasto|edesa|luz|energia|gas|agua|internet|telecom|personal|claro|alquiler|operativo|expensas|servicio/.test(norm)) {
    resultado.clasificacion = 'Gasto operativo';
    resultado.camposDetectados.push('Gasto operativo');
  }

  // Número de comprobante (extraer antes del importe para no confundir dígitos)
  const comp = extraerNumeroComprobante(texto);
  if (comp) {
    resultado.numeroComprobante = comp.numero;
    resultado.camposDetectados.push(`N° ${comp.numero}`);
    textoParaImporte = textoParaImporte.replace(comp.raw, ' ');
  }

  // Fecha
  const fecha = extraerFechaAR(texto);
  if (fecha) {
    resultado.fecha = fecha;
    resultado.camposDetectados.push('Fecha');
    textoParaImporte = textoParaImporte
      .replace(/\b\d{1,2}\s+de\s+[a-záéíóú]+(?:\s+(?:de|del)\s+\d{4})?\b/gi, ' ')
      .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ');
  }

  // Importe
  const importe = extraerImporteAR(textoParaImporte);
  if (importe && importe > 0) {
    resultado.importe = importe;
    resultado.camposDetectados.push('Importe');
  }

  // Proveedor / Emisor
  const provMatch = texto.match(
    /(?:proveedor|emisor|gasto\s+(?:de|en)|compra\s+(?:de|en|a)|ticket\s+(?:de|en)|factura\s+(?:de|en)|resumen\s+(?:de|del)|de|en)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9.&' ]{2,42}?)(?=\s*(?:,|;|\$|por\b|\d{2,}|hoy\b|ayer\b|anteayer\b|factura\b|comprobante\b|n[uú]mero\b|nro\b|$))/i
  );

  if (provMatch && provMatch[1]) {
    const provLimpio = provMatch[1]
      .replace(/^(la|el|los|las)\s+/i, '')
      .trim();
    if (provLimpio.length >= 2 && !/^(hoy|ayer|pesos|operativo)$/i.test(provLimpio)) {
      resultado.proveedor = provLimpio;
      resultado.camposDetectados.push(`Emisor: ${provLimpio}`);
    }
  }

  resultado.observacion = texto.charAt(0).toUpperCase() + texto.slice(1);
  return resultado;
}
