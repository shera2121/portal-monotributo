import { cleanCUIT } from './fiscalCalculations.js';
import { guardarJsonSeguro, leerJsonSeguro } from './storage.js';

/**
 * Paleta exclusiva para comprobantes del cliente (diferenciada de los colores
 * institucionales del Estudio: #0F4C5C, #E36414, #FBF8CC).
 */
export const COLORES_MARCA_CLIENTE = [
  { id: 'negro', nombre: 'Negro Clásico', hex: '#111827' },
  { id: 'esmeralda', nombre: 'Verde Esmeralda', hex: '#047857' },
  { id: 'celeste', nombre: 'Celeste Acero', hex: '#0284C7' },
  { id: 'indigo', nombre: 'Índigo', hex: '#4338CA' },
  { id: 'cafe', nombre: 'Marrón Café', hex: '#78350F' }
];

export const ESTILOS_PLANTILLA = [
  {
    id: 'clasico',
    nombre: 'Clásico',
    descripcion: 'Bloque superior redondeado, encabezados sólidos y barra inferior recta.'
  },
  {
    id: 'ondas',
    nombre: 'Ondas',
    descripcion: 'Ondas curvas suaves en encabezado y pie con totales suavizados.'
  },
  {
    id: 'minimalista',
    nombre: 'Minimalista',
    descripcion: 'Línea divisoria fina, tabla oscura neutra y acento geométrico discreto.'
  },
  {
    id: 'dinamico',
    nombre: 'Dinámico',
    descripcion: 'Cinta diagonal superior, ondas inferiores y saludo cordial en observaciones.'
  }
];

export const CONDICIONES_IVA_OPCIONES = [
  'Responsable Monotributo',
  'IVA Responsable Inscripto',
  'IVA Sujeto Exento'
];

export const DISENO_DEFAULT = {
  logoDataUrl: '',
  estilo: 'clasico',
  colorPrincipal: '#111827',
  nombreComercial: '',
  domicilioComercial: '',
  ingresosBrutos: '',
  inicioActividades: '',
  condicionIva: 'Responsable Monotributo'
};

function keyDiseno(cuit) {
  const c = cleanCUIT(cuit) || 'default';
  return `gr_marca_diseno_v1_${c}`;
}

function keyPresupuestos(cuit) {
  const c = cleanCUIT(cuit) || 'default';
  return `gr_presupuestos_v1_${c}`;
}

function keyPresupuestosSeq(cuit) {
  const c = cleanCUIT(cuit) || 'default';
  return `gr_presupuestos_seq_v1_${c}`;
}

export function leerDisenoCliente(cuit, cliente = null) {
  const guardado = leerJsonSeguro(keyDiseno(cuit), null);
  const base = {
    ...DISENO_DEFAULT,
    nombreComercial: cliente?.NombreFantasia || cliente?.Cliente || '',
    domicilioComercial: cliente?.Localidad ? `${cliente.Localidad}, Argentina` : 'Salta, Argentina',
    ingresosBrutos: cleanCUIT(cuit) || ''
  };
  if (!guardado || typeof guardado !== 'object') return base;
  return {
    ...base,
    ...guardado,
    estilo: ESTILOS_PLANTILLA.some((e) => e.id === guardado.estilo)
      ? guardado.estilo
      : DISENO_DEFAULT.estilo,
    colorPrincipal: /^#[0-9a-fA-F]{6}$/.test(String(guardado.colorPrincipal || ''))
      ? guardado.colorPrincipal
      : DISENO_DEFAULT.colorPrincipal
  };
}

export function guardarDisenoCliente(cuit, diseno) {
  const limpio = {
    ...DISENO_DEFAULT,
    ...diseno,
    estilo: ESTILOS_PLANTILLA.some((e) => e.id === diseno?.estilo)
      ? diseno.estilo
      : DISENO_DEFAULT.estilo,
    colorPrincipal: /^#[0-9a-fA-F]{6}$/.test(String(diseno?.colorPrincipal || ''))
      ? diseno.colorPrincipal
      : DISENO_DEFAULT.colorPrincipal
  };
  guardarJsonSeguro(keyDiseno(cuit), limpio);
  return limpio;
}

/**
 * Redimensiona un logotipo en <canvas> a un máximo de 400px en PNG/JPEG liviano
 * para incrustarlo de forma rápida y nítida en los PDFs generados con jsPDF.
 */
export function redimensionarLogoCliente(file, maxPx = 400) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('Seleccioná una imagen válida (PNG, JPG o WEBP).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo del logotipo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('La imagen del logotipo está dañada o no es compatible.'));
      img.onload = () => {
        try {
          const origW = img.naturalWidth || img.width || 1;
          const origH = img.naturalHeight || img.height || 1;
          const ratio = Math.min(1, maxPx / Math.max(origW, origH));
          const targetW = Math.max(1, Math.round(origW * ratio));
          const targetH = Math.max(1, Math.round(origH * ratio));

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Tu navegador no soporta procesamiento en canvas.'));
            return;
          }

          const esJpeg = /image\/jpe?g/i.test(file.type);
          if (esJpeg) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetW, targetH);
          } else {
            ctx.clearRect(0, 0, targetW, targetH);
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);

          let dataUrl = esJpeg
            ? canvas.toDataURL('image/jpeg', 0.86)
            : canvas.toDataURL('image/png');

          // Si el PNG supera 220KB en base64, comprimir a JPEG liviano sobre fondo blanco
          if (!esJpeg && dataUrl.length > 290000) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.drawImage(img, 0, 0, targetW, targetH);
            dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          }

          resolve({
            dataUrl,
            width: targetW,
            height: targetH
          });
        } catch (err) {
          reject(err);
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// HISTORIAL LOCAL Y NUMERACIÓN CORRELATIVA DE PRESUPUESTOS (P-0001-00000001)
// ============================================================================

export function formatearNumeroPresupuesto(secuencia) {
  const num = Math.max(1, Number(secuencia) || 1);
  return `P-0001-${String(num).padStart(8, '0')}`;
}

export function previsualizarSiguienteNumeroPresupuesto(cuit) {
  const actual = Number(leerJsonSeguro(keyPresupuestosSeq(cuit), 0)) || 0;
  return formatearNumeroPresupuesto(actual + 1);
}

export function consumirSiguienteNumeroPresupuesto(cuit) {
  const actual = Number(leerJsonSeguro(keyPresupuestosSeq(cuit), 0)) || 0;
  const siguiente = actual + 1;
  guardarJsonSeguro(keyPresupuestosSeq(cuit), siguiente);
  return formatearNumeroPresupuesto(siguiente);
}

export function leerPresupuestosCliente(cuit) {
  const lista = leerJsonSeguro(keyPresupuestos(cuit), []);
  return Array.isArray(lista) ? lista : [];
}

export function guardarPresupuestoCliente(cuit, presupuesto) {
  const lista = leerPresupuestosCliente(cuit);
  const actualizada = [presupuesto, ...lista.filter((p) => p.id !== presupuesto.id)].slice(0, 50);
  guardarJsonSeguro(keyPresupuestos(cuit), actualizada);
  return actualizada;
}

export function eliminarPresupuestoCliente(cuit, id) {
  const lista = leerPresupuestosCliente(cuit);
  const actualizada = lista.filter((p) => p.id !== id);
  guardarJsonSeguro(keyPresupuestos(cuit), actualizada);
  return actualizada;
}
