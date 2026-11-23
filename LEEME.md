# GR Estudio Digital — Portal de Autogestión Monotributo (PWA)

Esta es la evolución a **Aplicación Móvil Instalable (PWA)** del portal de **GR Estudio Impositivo Digital (GR Servicios Contables)**, pensada para reemplazar el uso diario del bot de Telegram en celulares Android, iPhone y computadoras.

---

## 1. Cómo probar la app en Modo Demo (ya viene lista)

Por defecto la app inicia en **Modo Demo** con un Monotributista realista de **Salta (Actividad: Servicios, Categoría D)**.

- **CUIT demo:** `20-34567890-4`
- **PIN de acceso demo:** `1450788980`
- También tenés un botón directo **"Ingresar rápido con Cuenta Demo"** en la pantalla de inicio.

### Cómo probar el Validador Anti-Duplicados en 10 segundos
1. Entrá a la pestaña central naranja **`+` (Cargar)**.
2. Tocá el botón **"Probar duplicado"** arriba a la derecha (o cargá manualmente Fecha `15/11/2026`, Importe `$ 45.800`, Proveedor `EDESA S.A.`, Comprobante `0012-00458912`).
3. Vas a ver la alerta en rojo con el comprobante previo y las dos opciones:
   - **"Cancelar (ya lo envié)"**
   - **"Confirmar: es un comprobante distinto"**

---

## 2. Cómo cambiar entre Modo Demo y Modo Producción (Google Apps Script)

Tenés **dos formas** muy simples (sin programar):

### Opción A — Editando el archivo `src/config.js`
Abrí el archivo `src/config.js` y modificá estas dos líneas:

```js
export const USE_MOCK_DATA = false; // true = Demo | false = Datos reales
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/TU_ID_AQUI/exec';
```

### Opción B — Desde Vercel (Recomendada para no tocar código)
En tu proyecto de Vercel entrá a **Settings → Environment Variables** y cargá:

| Variable | Valor |
| --- | --- |
| `VITE_USE_MOCK_DATA` | `false` (o `true` para demo) |
| `VITE_APPS_SCRIPT_URL` | `https://script.google.com/macros/s/.../exec` |

Luego tocá **Redeploy** en Vercel.

> **Importante:** No se usa ni se necesita ninguna `GEMINI_API_KEY` en Vercel. Si existía de una prueba vieja, podés borrarla con tranquilidad.

### Compatibilidad con tu planilla actual durante la transición
- En la pantalla de login el cliente ve **"PIN DE ACCESO"**, pero internamente la app envía tanto `pin` como `chat_id` para seguir siendo compatible con tu columna actual de `Chat_ID` de Telegram.
- Si tu Google Apps Script todavía responde con el formato anterior del portal, la app lo detecta automáticamente.
- Cuando actualices tu Google Apps Script para soportar el nuevo contrato completo:
  - `GET ?action=getPortalData&cuit={cuit}&pin={pin}` → devuelve `{ cliente, resumen12Meses, ventas, comprasGastos, alertasArca }`
  - `POST` con JSON `{ action, cuit, pin, payload }` para las acciones:
    - `uploadReceipt` (carga de comprobantes)
    - `requestInvoice` (solicitud de Factura C / Nota de Crédito C)
    - `requestVep` (solicitud de nuevo VEP)
    - `requestConstancia` (solicitud de constancia actualizada)

---

## 3. Cómo actualizar las escalas de Monotributo en cada recategorización de ARCA

Todas las categorías de la **A a la K** están centralizadas en un único archivo:

- **`src/data/escalasMonotributo.js`**

Cuando ARCA publique nuevas escalas semestrales, solo tenés que actualizar los números en ese archivo:
1. `TOPE_CATEGORIA_K_VIGENTE`: tope anual vigente de Categoría K (se usa para calcular el 40% Servicios / 80% Bienes del **Art. 20**).
2. `TOPE_MAXIMO_ANUAL`: tope proyectado de Categoría K para ventas.
3. Cada fila de `ESCALA_MONOTRIBUTO` (`cat`, `tope`, `topeVigente`, `cuotaServicios`, `cuotaBienes`).

Para actualizar el tope normativo de **Consumidor Final** (cuándo pedir DNI/CUIT en Factura C), modificá `TOPE_CONSUMIDOR_FINAL` en `src/config.js`.

---

## 4. Cómo desplegar la actualización en Vercel

### Desde GitHub (automático)
1. Subí el contenido de la carpeta `portal-monotributo-main` (donde está `package.json`, `index.html`, `src/`, `public/`, `vite.config.js`) a tu repositorio de GitHub `portal-monotributo`.
2. Vercel detectará automáticamente **Vite**:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. En 1 minuto tu PWA estará publicada en HTTPS y lista para instalar en el celular.

### Comandos locales (si querés probar en tu PC)
```bash
npm install
npm run dev     # Abre el servidor local de prueba
npm run build   # Genera la carpeta dist/ lista para producción
```

---

## 5. Cómo instalan la app tus clientes en el celular

- **Android (Chrome):** Al abrir el enlace verán el aviso **"Instalar app en tu celular"** (o menú `⋮` → *"Instalar aplicación"*). Queda el ícono **GR Estudio** en la pantalla principal sin barra de navegador.
- **iPhone (Safari):** Tocar el botón **Compartir** → **"Agregar a inicio"**.
- **PC (Chrome / Edge):** Ícono de instalar en la barra de direcciones.
