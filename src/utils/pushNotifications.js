/**
 * ============================================================================
 * GESTIÓN DE NOTIFICACIONES PUSH NATIVAS (Web Push + VAPID)
 * ============================================================================
 * Permite suscribir el celular del cliente (Android / Chrome / Edge / iOS 16.4+ PWA)
 * usando la clave pública VAPID y devolver { cuit, endpoint, keys: { p256dh, auth } }
 * para guardarlo en la pestaña Suscripciones_Push de Google Sheets.
 */

import { VAPID_PUBLIC_KEY } from '../config.js';
import { cleanCUIT } from './fiscalCalculations.js';
import { guardarJsonSeguro, leerJsonSeguro } from './storage.js';

const PUSH_SUB_STORAGE_KEY = 'gr_push_subscription_v1';

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function soportaNotificacionesPush() {
  if (typeof window === 'undefined') return false;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function obtenerEstadoPush(cuit = '') {
  const soportado = soportaNotificacionesPush();
  const permiso = soportado ? window.Notification.permission : 'unsupported';
  const guardado = leerJsonSeguro(PUSH_SUB_STORAGE_KEY, null);
  const cuitLimpio = cleanCUIT(cuit);
  const suscriptoEnEsteCelular = Boolean(
    permiso === 'granted' &&
      guardado?.endpoint &&
      (!cuitLimpio || cleanCUIT(guardado?.cuit) === cuitLimpio)
  );

  return {
    soportado,
    permiso, // 'default' | 'granted' | 'denied' | 'unsupported'
    suscriptoEnEsteCelular,
    endpointGuardado: guardado?.endpoint || ''
  };
}

export function guardarEstadoPushLocal({ cuit, endpoint }) {
  guardarJsonSeguro(PUSH_SUB_STORAGE_KEY, {
    cuit: cleanCUIT(cuit),
    endpoint,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Solicita permiso al usuario, obtiene el Service Worker activo y crea/recupera
 * la suscripción Web Push con la clave pública VAPID del estudio.
 */
export async function suscribirDispositivoPush({ cuit }) {
  if (!soportaNotificacionesPush()) {
    throw new Error(
      'Este navegador no soporta notificaciones Push. Abrí la app desde Chrome en Android (instalada como PWA) o en iOS desde Pantalla de Inicio.'
    );
  }

  const esLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!window.isSecureContext && !esLocal) {
    throw new Error(
      'Las notificaciones Push requieren HTTPS (funcionan automáticamente al abrir la app publicada en Vercel).'
    );
  }

  let permiso = window.Notification.permission;
  if (permiso === 'default') {
    permiso = await window.Notification.requestPermission();
  }

  if (permiso === 'denied') {
    throw new Error(
      'Las notificaciones están bloqueadas en este navegador. Habilitalas desde el ícono de candado / Configuración del sitio.'
    );
  }

  if (permiso !== 'granted') {
    throw new Error('No se otorgó permiso para enviar notificaciones en este celular.');
  }

  // Obtener registro del Service Worker (con timeout seguro para no colgar si está en dev sin SW)
  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    try {
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch {
      throw new Error(
        'El Service Worker aún no está activo en este modo de desarrollo. Al publicar en Vercel (HTTPS) se activa automáticamente.'
      );
    }
  }

  const readyReg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('El Service Worker tardó demasiado en activarse. Recargá la app e intentá nuevamente.')),
        8000
      )
    )
  ]);

  const swReg = readyReg || registration;
  let subscription = await swReg.pushManager.getSubscription();

  if (!subscription) {
    subscription = await swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  const subJson = subscription.toJSON();
  const endpoint = subJson?.endpoint || subscription.endpoint || '';
  const p256dh = subJson?.keys?.p256dh || '';
  const auth = subJson?.keys?.auth || '';

  if (!endpoint || !p256dh || !auth) {
    throw new Error('No se pudieron obtener las claves de suscripción Push del dispositivo.');
  }

  const resultado = {
    cuit: cleanCUIT(cuit),
    endpoint,
    keys: {
      p256dh,
      auth
    },
    p256dh,
    auth,
    dispositivo: navigator.userAgent || 'PWA'
  };

  return resultado;
}
