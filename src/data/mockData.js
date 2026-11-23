/**
 * ============================================================================
 * DATOS DE PRUEBA REALISTAS (MODO DEMO) — MONOTRIBUTISTA DE SALTA (SERVICIOS)
 * ============================================================================
 * Incluye:
 * - Perfil completo de contribuyente de Salta (Servicios, Categoría D)
 * - Comprobantes de ventas (Solicitada y Emitida con CAE)
 * - Comprobantes de compras/gastos en TODOS los estados:
 *     * Registrado
 *     * En revisión
 *     * Observado / Ilegible (con motivo del estudio)
 *     * Duplicado (con motivo del estudio)
 * - Caso listo para probar la alerta anti-duplicados:
 *     Fecha: 2026-11-15 | Importe: 45800 | Emisor: EDESA S.A. | N°: 0012-00458912
 *     (o archivo "factura_edesa_nov2026.pdf" de 184320 bytes)
 */

import { TOPE_CATEGORIA_K_VIGENTE } from './escalasMonotributo.js';

export const CASO_PRUEBA_DUPLICADO = {
  fecha: '2026-11-15',
  importe: 45800,
  proveedor: 'EDESA S.A.',
  numeroComprobante: '0012-00458912',
  archivoNombre: 'factura_edesa_nov2026.pdf'
};

export function crearDatosDemoIniciales() {
  return {
    cliente: {
      Cliente: 'GÓMEZ MARTÍN ALEJANDRO',
      NombreFantasia: 'MG Consultoría & Diseño Digital',
      CUIT: '20345678904',
      Chat_ID: '1450788980',
      PIN: '1450788980',
      Localidad: 'Salta Capital, Salta',
      Actividad: 'Servicios',
      Categoria_Actual: 'D',
      Importe_Cuota: 102612.93,
      Dia_Vencimiento: 20,
      Fecha_Proximo_Vencimiento: '2026-11-20',
      Estado_Pago: 'PENDIENTE', // PENDIENTE | PAGADO | VENCIDO
      Tope_Categoria_Actual: 34255083.76,
      Tope_Maximo_Monotributo: TOPE_CATEGORIA_K_VIGENTE,
      Limite_Compras_Art20_CatK: Math.round(TOPE_CATEGORIA_K_VIGENTE * 0.4 * 100) / 100,
      Total_Ventas_Facturadas: 25480000,
      Total_Compras_Gastos: 12650000,
      Ultimo_Comprobante_Bot: '🟢 DENTRO DEL LÍMITE',
      Link_Privado: '',
      vepDisponible: {
        numeroVep: '482910445',
        impuesto: 'Monotributo Integrado (ARCA + IIBB Salta)',
        periodo: '2026-11',
        vencimiento: '2026-11-20',
        importe: 102612.93,
        redPago: 'PagoMisCuentas',
        estado: 'Disponible para pago',
        urlPdf: ''
      },
      constanciaDisponible: {
        tipo: 'Constancia de Opción Monotributo e Inscripción ARCA',
        fechaEmision: '2026-11-02',
        vigenciaHasta: '2026-12-02',
        urlPdf: ''
      }
    },

    resumen12Meses: {
      periodoDesde: '2025-12',
      periodoHasta: '2026-11',
      ventasAcumuladas: 25480000,
      comprasGastosAcumulados: 12650000,
      cantidadVentas: 42,
      cantidadCompras: 58,
      ultimaActualizacion: '2026-11-23 09:30'
    },

    ventas: [
      {
        id: 'V-2026-105',
        tipoComprobante: 'Factura C',
        numeroComprobante: 'Pendiente de emisión',
        cae: '',
        fecha: '2026-11-22',
        periodo: '2026-11',
        concepto: 'Servicios',
        fechaDesde: '2026-11-01',
        fechaHasta: '2026-11-30',
        receptorTipo: 'CUIT / DNI específico',
        receptorDocumento: '30-71548291-2',
        receptorNombre: 'Bodega Valle Calchaquí S.R.L.',
        condicionVenta: 'Transferencia / Mercado Pago',
        descripcion: 'Gestión de campañas digitales y mantenimiento web — Noviembre 2026',
        importe: 950000,
        estado: 'Solicitada',
        motivoObservacion: '',
        archivoUrl: ''
      },
      {
        id: 'V-2026-104',
        tipoComprobante: 'Factura C',
        numeroComprobante: '0002-00000418',
        cae: '76462819405218',
        fecha: '2026-11-14',
        periodo: '2026-11',
        concepto: 'Servicios',
        fechaDesde: '2026-11-01',
        fechaHasta: '2026-11-14',
        receptorTipo: 'CUIT / DNI específico',
        receptorDocumento: '30-70984512-9',
        receptorNombre: 'Hotel Colonial Salta S.A.',
        condicionVenta: 'Transferencia / Mercado Pago',
        descripcion: 'Rediseño de identidad visual y folletería temporada verano',
        importe: 1420000,
        estado: 'Emitida / Con CAE',
        motivoObservacion: '',
        archivoUrl: ''
      },
      {
        id: 'V-2026-103',
        tipoComprobante: 'Nota de Crédito C',
        numeroComprobante: '0002-00000019',
        facturaAsociada: '0002-00000415',
        cae: '76459920183442',
        fecha: '2026-11-09',
        periodo: '2026-11',
        concepto: 'Servicios',
        fechaDesde: '2026-10-01',
        fechaHasta: '2026-10-31',
        receptorTipo: 'Consumidor Final',
        receptorDocumento: '',
        receptorNombre: 'Consumidor Final',
        condicionVenta: 'Transferencia / Mercado Pago',
        descripcion: 'Bonificación parcial por ajuste de horas de consultoría',
        importe: 180000,
        estado: 'Emitida / Con CAE',
        motivoObservacion: '',
        archivoUrl: ''
      },
      {
        id: 'V-2026-102',
        tipoComprobante: 'Factura C',
        numeroComprobante: '0002-00000415',
        cae: '76441082934115',
        fecha: '2026-10-28',
        periodo: '2026-10',
        concepto: 'Servicios',
        fechaDesde: '2026-10-01',
        fechaHasta: '2026-10-31',
        receptorTipo: 'CUIT / DNI específico',
        receptorDocumento: '27-31884512-6',
        receptorNombre: 'Estudio Jurídico Belgrano',
        condicionVenta: 'Contado',
        descripcion: 'Asesoramiento mensual en presencia digital y pauta',
        importe: 1180000,
        estado: 'Emitida / Con CAE',
        motivoObservacion: '',
        archivoUrl: ''
      },
      {
        id: 'V-2026-101',
        tipoComprobante: 'Factura C',
        numeroComprobante: '0002-00000410',
        cae: '76402195843011',
        fecha: '2026-09-25',
        periodo: '2026-09',
        concepto: 'Servicios',
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
        receptorTipo: 'CUIT / DNI específico',
        receptorDocumento: '30-71548291-2',
        receptorNombre: 'Bodega Valle Calchaquí S.R.L.',
        condicionVenta: 'Transferencia / Mercado Pago',
        descripcion: 'Desarrollo de catálogo interactivo y estrategia comercial',
        importe: 1650000,
        estado: 'Emitida / Con CAE',
        motivoObservacion: '',
        archivoUrl: ''
      }
    ],

    comprasGastos: [
      {
        id: 'C-2026-206',
        clasificacion: 'Gasto operativo',
        fecha: '2026-11-15',
        periodo: '2026-11',
        importe: 45800,
        proveedor: 'EDESA S.A.',
        cuitEmisor: '30-68897442-1',
        numeroComprobante: '0012-00458912',
        observacion: 'Energía eléctrica oficina — Período 11/2026 (Caso listo para probar anti-duplicados)',
        estado: 'Registrado',
        motivoObservacion: '',
        archivoNombre: 'factura_edesa_nov2026.pdf',
        archivoTamano: 184320,
        archivoTipo: 'application/pdf',
        archivoUrl: '',
        fechaCarga: '2026-11-16T10:15:00-03:00'
      },
      {
        id: 'C-2026-205',
        clasificacion: 'Resumen Bancario / Mercado Pago',
        fecha: '2026-11-18',
        periodo: '2026-11',
        importe: 312450,
        proveedor: 'Mercado Pago / Banco Macro',
        cuitEmisor: '30-70308853-4',
        numeroComprobante: 'RES-2026-11',
        observacion: 'Resumen de comisiones e impuestos bancarios noviembre',
        estado: 'En revisión',
        motivoObservacion: '',
        archivoNombre: 'resumen_mp_nov2026.pdf',
        archivoTamano: 245100,
        archivoTipo: 'application/pdf',
        archivoUrl: '',
        fechaCarga: '2026-11-19T14:22:00-03:00'
      },
      {
        id: 'C-2026-204',
        clasificacion: 'Compra / Proveedor',
        fecha: '2026-11-10',
        periodo: '2026-11',
        importe: 189500,
        proveedor: 'Librería y Papelería Lerma S.R.L.',
        cuitEmisor: '30-71122334-8',
        numeroComprobante: '0003-00018422',
        observacion: 'Insumos de oficina, toners y resmas A4',
        estado: 'Registrado',
        motivoObservacion: '',
        archivoNombre: 'fc_lerma_18422.jpg',
        archivoTamano: 412000,
        archivoTipo: 'image/jpeg',
        archivoUrl: '',
        fechaCarga: '2026-11-10T17:40:00-03:00'
      },
      {
        id: 'C-2026-203',
        clasificacion: 'Ticket / Otro',
        fecha: '2026-11-08',
        periodo: '2026-11',
        importe: 64200,
        proveedor: 'Estación de Servicio YPF Av. Paraguay',
        cuitEmisor: '30-54668997-9',
        numeroComprobante: '0008-00094120',
        observacion: 'Combustible viaje reunión con clientes Cafayate',
        estado: 'Observado / Ilegible',
        motivoObservacion: 'La foto salió borrosa y no se distingue el CAE ni el importe total. Por favor volvé a sacar una foto más nítida.',
        archivoNombre: 'ticket_ypf_borroso.jpg',
        archivoTamano: 158400,
        archivoTipo: 'image/jpeg',
        archivoUrl: '',
        fechaCarga: '2026-11-08T19:05:00-03:00'
      },
      {
        id: 'C-2026-202',
        clasificacion: 'Compra / Proveedor',
        fecha: '2026-11-10',
        periodo: '2026-11',
        importe: 189500,
        proveedor: 'Librería y Papelería Lerma S.R.L.',
        cuitEmisor: '30-71122334-8',
        numeroComprobante: '0003-00018422',
        observacion: 'Copia reenviada por error',
        estado: 'Duplicado',
        motivoObservacion: 'Comprobante ya registrado el 10/11/2026 (N° 0003-00018422 por $ 189.500,00). Descartado para no duplicar gastos.',
        archivoNombre: 'fc_lerma_copia.jpg',
        archivoTamano: 410500,
        archivoTipo: 'image/jpeg',
        archivoUrl: '',
        fechaCarga: '2026-11-11T09:10:00-03:00'
      },
      {
        id: 'C-2026-201',
        clasificacion: 'Gasto operativo',
        fecha: '2026-10-21',
        periodo: '2026-10',
        importe: 128900,
        proveedor: 'Telecom Argentina S.A.',
        cuitEmisor: '30-63945373-8',
        numeroComprobante: '0144-08912451',
        observacion: 'Internet fibra óptica estudio + telefonía móvil',
        estado: 'Registrado',
        motivoObservacion: '',
        archivoNombre: 'telecom_oct2026.pdf',
        archivoTamano: 196200,
        archivoTipo: 'application/pdf',
        archivoUrl: '',
        fechaCarga: '2026-10-22T11:00:00-03:00'
      }
    ],

    alertasArca: [
      {
        id: 'AL-01',
        fecha: '2026-11-20',
        origen: 'ARCA — Domicilio Fiscal Electrónico',
        titulo: 'Vencimiento cuota Monotributo Noviembre 2026',
        detalle: 'Recordá abonar tu VEP de Categoría D ($ 102.612,93) con componente integrado de IIBB Salta antes del cierre bancario para evitar intereses resarcitorios.',
        prioridad: 'Alta',
        leida: false
      },
      {
        id: 'AL-02',
        fecha: '2026-11-16',
        origen: 'GR Estudio Impositivo Digital',
        titulo: 'Comprobante observado: YPF Av. Paraguay',
        detalle: 'El ticket cargado el 08/11 ($ 64.200,00) resultó ilegible. Podés volver a sacarle foto desde el botón "+" para incluirlo en el control mensual.',
        prioridad: 'Media',
        leida: false
      },
      {
        id: 'AL-03',
        fecha: '2026-11-05',
        origen: 'ARCA — Recategorización Semestral',
        titulo: 'Control preventivo de facturación acumulada',
        detalle: 'Tu facturación de los últimos 12 meses se encuentra al 74,4% del tope proyectado de Categoría D. Te sugerimos usar el Simulador en "Mi Informe" antes de emitir facturas grandes.',
        prioridad: 'Normal',
        leida: true
      }
    ],

    solicitudesTramites: []
  };
}
