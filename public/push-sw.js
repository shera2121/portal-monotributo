/* ============================================================================
 * SERVICE WORKER — SOPORTE WEB PUSH NATIVO (GR ESTUDIO IMPOSITIVO DIGITAL)
 * ============================================================================
 * Importado automáticamente en el Service Worker generado por vite-plugin-pwa.
 * Maneja:
 *  - Evento 'push': muestra notificación nativa con sonido, ícono y vibración.
 *  - Evento 'notificationclick': abre el enlace del PDF o "Mis Documentos".
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
    'Tenés un nuevo documento (VEP, Constancia o Factura) disponible para descargar.';

  const targetUrl =
    payload.data?.url ||
    payload.url ||
    payload.pdfUrl ||
    '/?seccion=documentos';

  const options = {
    body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    silent: false,
    tag: payload.tag || 'gr-estudio-documento',
    renotify: true,
    data: {
      ...(payload.data || {}),
      url: targetUrl
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification?.data?.url || '/?seccion=documentos';

  event.waitUntil(
    (async () => {
      const targetFullUrl = new URL(rawUrl, self.location.origin).href;
      const esMismoOrigen = targetFullUrl.startsWith(self.location.origin);

      // Si es un enlace directo a PDF externo (ej. Google Drive), abrirlo directo
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
