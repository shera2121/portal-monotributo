/**
 * ============================================================================
 * ARCHIVO ÚNICO DE CONFIGURACIÓN — GR ESTUDIO IMPOSITIVO DIGITAL
 * ============================================================================
 * Editá este archivo para controlar el comportamiento general de la app
 * sin necesidad de tocar el resto del código.
 *
 * También podés configurar VITE_APPS_SCRIPT_URL y VITE_USE_MOCK_DATA desde
 * las Variables de Entorno de Vercel (Settings -> Environment Variables).
 */

const envMock = import.meta.env.VITE_USE_MOCK_DATA;
const envAppsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL || '';

/**
 * 1. MODO PRUEBA vs. MODO REAL
 * - true  -> Usa datos realistas de demostración (Monotributista de Salta).
 * - false -> Se conecta en vivo a tu Google Apps Script / planilla real.
 *
 * Tip: Si cargás VITE_USE_MOCK_DATA=false en Vercel, se activa el modo real
 * automáticamente sin cambiar este archivo.
 */
export const USE_MOCK_DATA =
  envMock !== undefined ? String(envMock).toLowerCase() === 'true' : false;

/**
 * 2. URL DEL PUENTE DE GOOGLE APPS SCRIPT (/exec)
 * Pegá aquí la URL publicada de tu Web App de Google Apps Script
 * (o definila en Vercel como VITE_APPS_SCRIPT_URL).
 * La app también respeta la URL que haya viajado por enlace privado (?k=...)
 * o la guardada desde el Modo Contador.
 */
export const APPS_SCRIPT_URL =
  envAppsScriptUrl ||
  'https://script.google.com/macros/s/AKfycbxsIZPA3SDAx9DtrXbS6Exfve7irSjNRDTGEeFIjFHhSv1gNWzfPXi_yqGZMtNMwIVQ/exec';

/**
 * 3. MODO DE FACTURACIÓN DIRECTA CON ARCA (SEGURIDAD)
 * MANTENER EN false: Por seguridad contable, todas las solicitudes de
 * Facturas C y Notas de Crédito C ingresan con estado "Solicitada"
 * para revisión y emisión controlada por el estudio.
 */
export const ARCA_DIRECT_MODE = false;

/**
 * 4. TOPE NORMATIVO PARA CONSUMIDOR FINAL (ARCA)
 * Cuando el importe de una Factura C a "Consumidor Final" iguala o supera
 * este valor en pesos argentinos, la app solicita obligatoriamente DNI o CUIT.
 * Actualizalo cuando ARCA modifique la resolución vigente (RG 5700).
 */
export const TOPE_CONSUMIDOR_FINAL = 10000000;

/**
 * 5. CLAVE PÚBLICA VAPID PARA NOTIFICACIONES PUSH NATIVAS (ANDROID / PWA)
 * Se usa únicamente para suscribir el celular del cliente con pushManager.subscribe.
 * La clave privada VAPID permanece exclusivamente en tu Centro de Control / servidor.
 */
export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BBGt5g6phAgGSygPsGTpoCDXMAUiRMuTCafeArvobXmQOBErdtG6OcpClUQO_2boH493GT0tmT6Z4ECgATejogA';

/**
 * 6. DATOS DE IDENTIDAD DEL ESTUDIO
 */
export const ESTUDIO_INFO = {
  nombreCorto: 'GR Estudio',
  nombreCompleto: 'GR Estudio Impositivo Digital',
  razonSocial: 'GR Servicios Contables',
  provinciaDefault: 'Salta',
  // Intervalo de auto-refresco silencioso en producción (5 minutos)
  intervaloSincronizacionMs: 300000
};

/**
 * 6. DATOS DE ACCESO DEMO (Solo visibles cuando USE_MOCK_DATA = true)
 */
export const DEMO_CREDENTIALS = {
  cuit: '20345678904',
  cuitFormateado: '20-34567890-4',
  pin: '1450788980'
};
