/**
 * ============================================================================
 * ESCALAS DE MONOTRIBUTO ARCA (CATEGORÍAS A a K)
 * ============================================================================
 * Archivo separado para actualizar fácilmente en cada recategorización semestral.
 *
 * Referencia actual conservada del portal original:
 * - Factor IPC aplicado a tope proyectado de ventas: 1.1184 (con Octubre 2,2%)
 * - Cuotas mensuales incluyen componente impositivo + previsional + obra social + IIBB Salta.
 * - Regla Art. 20 (Compras/Gastos): se calcula SIEMPRE sobre TOPE_CATEGORIA_K_VIGENTE:
 *     * Servicios: 40% del tope anual de Categoría K
 *     * Venta de Cosas Muebles: 80% del tope anual de Categoría K
 */

export const FACTOR_IPC = 1.1184;
export const ETIQUETA_ACTUALIZACION = 'Escala ARCA vigente + Proyección IPC (Factor 1,1184) + IIBB Salta';

/**
 * Tope Categoría K Vigente ($126.610.838,75)
 * Base legal prudente para exclusión por compras Art. 20.
 */
export const TOPE_CATEGORIA_K_VIGENTE = 126610838.75;

/**
 * Tope Categoría K Proyectado con IPC Factor 1.1184 ($141.601.562,06)
 * Base máxima anual para proyección de ventas.
 */
export const TOPE_MAXIMO_ANUAL = 141601562.06;

/**
 * Umbrales de alertas Art. 20 sobre el límite de Categoría K
 */
export const UMBRAL_ALERTA_PREVENTIVA_ART20 = 0.75; // 75% -> Alerta preventiva (Amarillo)
export const UMBRAL_ALERTA_CRITICA_ART20 = 1.0;     // 100% -> Riesgo de exclusión (Rojo)

/**
 * Tabla completa Categorías A a K (valores exactos del portal original)
 */
export const ESCALA_MONOTRIBUTO = [
  { cat: 'A', tope: 13431324.65, topeVigente: 12009410.45, cuotaServicios: 58027.18, cuotaBienes: 58027.18 },
  { cat: 'B', tope: 19678452.38, topeVigente: 17595182.74, cuotaServicios: 67379.08, cuotaBienes: 67379.08 },
  { cat: 'C', tope: 27591480.84, topeVigente: 24670494.31, cuotaServicios: 80520.12, cuotaBienes: 79030.58 },
  { cat: 'D', tope: 34255083.76, topeVigente: 30628651.43, cuotaServicios: 102612.93, cuotaBienes: 100564.81 },
  { cat: 'E', tope: 40293973.92, topeVigente: 36028231.33, cuotaServicios: 142811.45, cuotaBienes: 131267.51 },
  { cat: 'F', tope: 50497615.88, topeVigente: 45151659.41, cuotaServicios: 179784.21, cuotaBienes: 158930.65 },
  { cat: 'G', tope: 60388901.46, topeVigente: 53995798.87, cuotaServicios: 265312.94, cuotaBienes: 193815.05 },
  { cat: 'H', tope: 91624540.16, topeVigente: 81924660.37, cuotaServicios: 570706.68, cuotaBienes: 365895.01 },
  { cat: 'I', tope: 102557013.71, topeVigente: 91699761.90, cuotaServicios: 1025747.86, cuotaBienes: 536992.78 },
  { cat: 'J', tope: 117446001.47, topeVigente: 105012519.20, cuotaServicios: 1242299.76, cuotaBienes: 655793.69 },
  { cat: 'K', tope: 141601562.06, topeVigente: 126610838.75, cuotaServicios: 1704446.04, cuotaBienes: 792103.24 }
];
