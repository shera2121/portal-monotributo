/* ============================================================================
 * SERVICE WORKER — SOPORTE WEB PUSH NATIVO (GR ESTUDIO IMPOSITIVO DIGITAL)
 * ============================================================================
 * Importado automáticamente en el Service Worker generado por vite-plugin-pwa.
 * Maneja:
 *  - Evento 'push': muestra notificación nativa en Android con sonido, ícono,
 *    vibración [200, 100, 200], renotify y requireInteraction.
 *  - Evento 'notificationclick': abre directamente el PDF de la factura/documento
 *    (data.pdfUrl / data.url) o la sección "Mis Documentos" de la PWA.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || payload.titulo || 'GR Estudio Impositivo Digital';
  const body =
    payload.body ||
    payload.mensaje ||
    payload.cuerpo ||
    'Tenés una nueva factura o documento PDF disponible para descargar.';

  const pdfUrl =
    payload.data?.pdfUrl ||
    payload.pdfUrl ||
    payload.data?.url ||
    payload.url ||
    '/?seccion=documentos';

  const options = {
    body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    silent: false,
    renotify: true,
    tag: payload.tag || payload.data?.tag || `gr-estudio-doc-${Date.now()}`,
    actions: [
      { action: 'open_pdf', title: 'Ver / Descargar PDF' },
      { action: 'open_app', title: 'Abrir Mis Documentos' }
    ],
    data: {
      ...(payload.data || {}),
      url: pdfUrl,
      pdfUrl
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification?.data || {};
  const rawUrl =
    event.action === 'open_app'
      ? '/?seccion=documentos'
      : notifData.pdfUrl || notifData.url || '/?seccion=documentos';

  event.waitUntil(
    (async () => {
      let targetFullUrl;
      try {
        targetFullUrl = new URL(rawUrl, self.location.origin).href;
      } catch {
        targetFullUrl = new URL('/?seccion=documentos', self.location.origin).href;
      }

      const esMismoOrigen = targetFullUrl.startsWith(self.location.origin);

      // Si es un enlace directo a PDF externo (ej. Google Drive / factura ARCA), abrirlo directamente
      if (!esMismoOrigen) {
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetFullUrl);
        }
        return undefined;
      }

      // Si es una ruta interna (ej. /?seccion=documentos), enfocar o abrir la PWA
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(targetFullUrl);
            } catch {
              // Ignorar si el navegador restringe navigate
            }
          }
          return client;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetFullUrl);
      }
      return undefined;
    })()
  );
});
