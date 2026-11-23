/**
 * Procesa y comprime fotos pesadas tomadas desde celular (Canvas JPEG)
 * manteniendo PDFs sin modificar.
 */

export function formatBytes(bytes = 0) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export async function prepararArchivoComprobante(file, { maxDimension = 1600, quality = 0.78 } = {}) {
  if (!file) throw new Error('No se seleccionó ningún archivo.');

  const originalSize = file.size;
  const nombreLower = String(file.name || '').toLowerCase();
  const esImagen = file.type.startsWith('image/');
  const esPdf = file.type === 'application/pdf' || nombreLower.endsWith('.pdf');
  const esCsv =
    file.type === 'text/csv' ||
    file.type === 'application/csv' ||
    nombreLower.endsWith('.csv');

  if (!esImagen && !esPdf && !esCsv) {
    throw new Error('Formato no soportado. Subí una foto (JPG, PNG, WEBP), un PDF o un extracto CSV.');
  }

  // Si es CSV, PDF o imagen liviana (< 350 KB), leer directo como DataURL sin pasar por Canvas
  if (esCsv || esPdf || originalSize <= 350 * 1024) {
    const dataUrl = await leerComoDataUrl(file);
    return {
      nombre: file.name,
      tipo: esCsv ? 'text/csv' : esPdf ? 'application/pdf' : file.type,
      tamanoOriginal: originalSize,
      tamanoFinal: originalSize,
      comprimido: false,
      esPdf,
      esCsv,
      previewUrl: esCsv ? '' : dataUrl,
      base64: dataUrl.split(',')[1] || ''
    };
  }

  // Comprimir foto pesada en Canvas
  const dataUrlOriginal = await leerComoDataUrl(file);
  const img = await cargarImagen(dataUrlOriginal);

  let width = img.width;
  let height = img.height;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = compressedDataUrl.split(',')[1] || '';
  const estimatedSize = Math.round((base64.length * 3) / 4);

  return {
    nombre: file.name,
    tipo: 'image/jpeg',
    tamanoOriginal: originalSize,
    tamanoFinal: Math.min(originalSize, estimatedSize),
    comprimido: estimatedSize < originalSize,
    esPdf: false,
    esCsv: false,
    previewUrl: compressedDataUrl,
    base64
  };
}

function leerComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
    img.src = src;
  });
}
