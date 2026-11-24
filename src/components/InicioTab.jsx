import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  Briefcase,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileBadge2,
  FileDown,
  PieChart,
  Receipt,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  ShoppingBag,
  X
} from 'lucide-react';
import {
  FACTOR_IPC,
  TOPE_CATEGORIA_K_VIGENTE,
  TOPE_MAXIMO_ANUAL
} from '../data/escalasMonotributo.js';
import {
  formatARS,
  formatCUIT,
  formatFechaAR,
  getPeriodoActual
} from '../utils/fiscalCalculations.js';
import {
  compartirDocumento,
  descargarBlob,
  generarPdfConstancia,
  generarPdfVep
} from '../utils/documentHelpers.js';
import {
  guardarEstadoPushLocal,
  obtenerEstadoPush,
  suscribirDispositivoPush
} from '../utils/pushNotifications.js';
import { BarComparativaChart, DoughnutMedidorIndividual } from './ChartsMonotributo.jsx';
import InstallPwaBanner from './InstallPwaBanner.jsx';

const IMPUESTOS_VEP = [
  'Monotributo',
  'Ingresos Brutos DGR Salta',
  'Convenio Multilateral',
  'Otro'
];

const REDES_PAGO = ['PagoMisCuentas', 'Red Link', 'Interbanking'];

export default function InicioTab({
  cliente,
  calculos,
  alertasArca = [],
  solicitudesDocumentos = [],
  actualizando = false,
  autoScrollDocumentos = false,
  onActualizarInforme,
  onGuardarSuscripcionPush,
  onSolicitarVep,
  onSolicitarConstancia,
  onIrASimulador,
  onToast
}) {
  const informeRealRef = useRef(null);
  const documentosRef = useRef(null);
  const [modalVep, setModalVep] = useState(false);
  const [modalConstancia, setModalConstancia] = useState(false);
  const [alertaExpandida, setAlertaExpandida] = useState(null);

  // Estado de notificaciones Push en este celular
  const [estadoPush, setEstadoPush] = useState(() => obtenerEstadoPush(cliente?.CUIT));
  const [activandoPush, setActivandoPush] = useState(false);

  useEffect(() => {
    setEstadoPush(obtenerEstadoPush(cliente?.CUIT));
  }, [cliente?.CUIT]);

  useEffect(() => {
    if (autoScrollDocumentos && documentosRef.current) {
      setTimeout(() => {
        documentosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
  }, [autoScrollDocumentos]);

  const handleActivarNotificaciones = async () => {
    setActivandoPush(true);
    try {
      const subData = await suscribirDispositivoPush({ cuit: cliente.CUIT });
      if (onGuardarSuscripcionPush) {
        await onGuardarSuscripcionPush(subData);
      }
      guardarEstadoPushLocal({ cuit: cliente.CUIT, endpoint: subData.endpoint });
      setEstadoPush(obtenerEstadoPush(cliente.CUIT));
      onToast('¡Notificaciones activadas en este celular! Te avisaremos cuando lleguen tus PDFs.');
    } catch (err) {
      setEstadoPush(obtenerEstadoPush(cliente?.CUIT));
      onToast(err?.message || 'No se pudieron activar las notificaciones en este dispositivo.', 'error');
    } finally {
      setActivandoPush(false);
    }
  };

  const handleDescargarDocumentoPdf = (doc) => {
    if (!doc?.pdfUrl) return;
    // En modo demo, si el link es ficticio (demo-*), generar PDF real descargable
    if (doc.pdfUrl.includes('/demo-')) {
      const esVep = String(doc.tipo || '').toLowerCase().includes('vep');
      const blob = esVep ? generarPdfVep(cliente) : generarPdfConstancia(cliente);
      descargarBlob(blob, `${String(doc.tipo || 'Documento').replace(/\s+/g, '_')}_${cliente.CUIT}.pdf`);
      onToast('PDF descargado en tu dispositivo.');
      return;
    }
    window.open(doc.pdfUrl, '_blank', 'noopener,noreferrer');
    onToast('Abriendo PDF para descargar...');
  };

  const handleCompartirDocumentoPdf = async (doc) => {
    if (!doc?.pdfUrl) return;
    const esDemoLink = doc.pdfUrl.includes('/demo-');
    const esVep = String(doc.tipo || '').toLowerCase().includes('vep');
    const blob = esDemoLink ? (esVep ? generarPdfVep(cliente) : generarPdfConstancia(cliente)) : null;

    const res = await compartirDocumento({
      titulo: `${doc.tipo} — ${cliente.Cliente}`,
      texto: `${doc.tipo}${doc.detalle ? ` (${doc.detalle})` : ''} — GR Estudio Impositivo Digital`,
      url: esDemoLink ? undefined : doc.pdfUrl,
      blob,
      nombreArchivo: `${String(doc.tipo || 'Documento').replace(/\s+/g, '_')}_${cliente.CUIT}.pdf`
    });

    if (res.shared) {
      onToast(
        res.method === 'clipboard-fallback'
          ? 'Enlace del PDF copiado para compartir.'
          : res.method === 'download-fallback'
            ? 'PDF descargado para compartir.'
            : 'Documento listo para compartir.'
      );
    }
  };

  const irAlInformeReal = () => {
    informeRealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Colores e indicadores 100% reales e independientes (Ventas vs. Compras Art. 20)
  const superaVentasCatActual = calculos.ventasTotales > calculos.topeCat;
  const precaucionVentas = !superaVentasCatActual && calculos.porcentaje >= 80;
  const colorVentasHex = superaVentasCatActual
    ? '#dc2626'
    : precaucionVentas
      ? '#d97706'
      : '#0F4C5C';
  const badgeVentas = superaVentasCatActual
    ? { texto: 'Supera tope', cls: 'bg-red-100 text-red-800 border-red-200' }
    : precaucionVentas
      ? { texto: 'Precaución ≥80%', cls: 'bg-amber-100 text-amber-900 border-amber-200' }
      : { texto: 'En regla', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };

  const colorGastosHex = calculos.alertaExclusionGastos
    ? '#dc2626'
    : calculos.alertaPrecaucionGastos
      ? '#d97706'
      : '#16a34a';
  const badgeGastos = calculos.alertaExclusionGastos
    ? { texto: 'Exclusión Art. 20', cls: 'bg-red-100 text-red-800 border-red-200' }
    : calculos.alertaPrecaucionGastos
      ? { texto: 'Alerta ≥75%', cls: 'bg-amber-100 text-amber-900 border-amber-200' }
      : { texto: 'Dentro del tope', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };

  // Estado formulario Nuevo VEP
  const [vepImpuesto, setVepImpuesto] = useState('Monotributo');
  const [vepPeriodo, setVepPeriodo] = useState(getPeriodoActual());
  const [vepRed, setVepRed] = useState('PagoMisCuentas');
  const [vepNota, setVepNota] = useState('');
  const [enviandoVep, setEnviandoVep] = useState(false);
  const [enviandoConstancia, setEnviandoConstancia] = useState(false);

  const estadoPagoNorm = String(cliente?.Estado_Pago || 'PENDIENTE').toUpperCase();
  const estiloPago =
    estadoPagoNorm.includes('PAG')
      ? { label: 'Pagado', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
      : estadoPagoNorm.includes('VENC')
        ? { label: 'Vencido', cls: 'bg-red-100 text-red-800 border-red-200' }
        : { label: 'Pendiente', cls: 'bg-amber-100 text-amber-900 border-amber-200' };

  const semaforo =
    calculos.estado === 'VERDE'
      ? {
          texto: 'Verde — En regla',
          dot: 'bg-emerald-500',
          pill: 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }
      : calculos.estado === 'AMARILLO'
        ? {
            texto: 'Amarillo — Precaución',
            dot: 'bg-amber-500',
            pill: 'bg-amber-50 text-amber-900 border-amber-200'
          }
        : {
            texto: 'Rojo — Atención urgente',
            dot: 'bg-red-600',
            pill: 'bg-red-50 text-red-800 border-red-200'
          };

  const handleDescargarVep = () => {
    if (cliente?.vepDisponible?.urlPdf) {
      window.open(cliente.vepDisponible.urlPdf, '_blank', 'noopener,noreferrer');
      onToast('Abriendo último VEP disponible...');
      return;
    }
    const blob = generarPdfVep(cliente);
    descargarBlob(blob, `VEP_${cliente.CUIT}_${cliente.vepDisponible?.periodo || getPeriodoActual()}.pdf`);
    onToast('Último VEP descargado en PDF.');
  };

  const handleEnviarSolicitudVep = async (e) => {
    e.preventDefault();
    setEnviandoVep(true);
    try {
      await onSolicitarVep({
        impuesto: vepImpuesto,
        periodo: vepPeriodo,
        redPago: vepRed,
        observacion: vepNota.trim()
      });
      setVepNota('');
      setModalVep(false);
    } finally {
      setEnviandoVep(false);
    }
  };

  const handleDescargarConstancia = () => {
    if (cliente?.constanciaDisponible?.urlPdf) {
      window.open(cliente.constanciaDisponible.urlPdf, '_blank', 'noopener,noreferrer');
      onToast('Abriendo Constancia en PDF...');
      return;
    }
    const blob = generarPdfConstancia(cliente);
    descargarBlob(blob, `Constancia_Monotributo_${cliente.CUIT}.pdf`);
    onToast('Constancia de Monotributo descargada en PDF.');
  };

  const handleCompartirConstancia = async () => {
    const blob = cliente?.constanciaDisponible?.urlPdf ? null : generarPdfConstancia(cliente);
    const res = await compartirDocumento({
      titulo: `Constancia Monotributo — ${cliente.Cliente}`,
      texto: `Constancia de Monotributo (${cliente.Cliente} — CUIT ${formatCUIT(cliente.CUIT)} — Cat. ${cliente.Categoria_Actual})`,
      url: cliente?.constanciaDisponible?.urlPdf || undefined,
      blob,
      nombreArchivo: `Constancia_Monotributo_${cliente.CUIT}.pdf`
    });
    if (res.shared) {
      onToast(
        res.method === 'download-fallback'
          ? 'Se descargó el PDF para que puedas enviarlo por WhatsApp.'
          : 'Constancia lista para compartir.'
      );
    }
  };

  const handleSolicitarConstancia = async () => {
    setEnviandoConstancia(true);
    try {
      await onSolicitarConstancia({ tipo: 'Constancia de Monotributo / Inscripción' });
      setModalConstancia(false);
    } finally {
      setEnviandoConstancia(false);
    }
  };

  const badgePrioridad = (prio) => {
    const p = String(prio || 'Normal').toLowerCase();
    if (p === 'alta') return 'bg-red-100 text-red-800 border-red-200';
    if (p === 'media') return 'bg-amber-100 text-amber-900 border-amber-200';
    return 'bg-petroleo-50 text-petroleo border-petroleo-100';
  };

  return (
    <div className="space-y-4">
      <InstallPwaBanner />

      {/* BANNER PARA ACTIVAR NOTIFICACIONES PUSH NATIVAS EN ESTE CELULAR (SOLO SI AÚN NO OTORGÓ PERMISO / NO SUSCRIPTO) */}
      {estadoPush.soportado && !estadoPush.suscriptoEnEsteCelular && (
        <section className="bg-white rounded-3xl shadow-sm border-2 border-ladrillo/40 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ladrillo-50 text-ladrillo flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-black text-petroleo leading-tight">
                Recibí tus VEPs, Constancias y Facturas al instante
              </h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                {estadoPush.permiso === 'denied'
                  ? 'Bloqueaste las notificaciones en este navegador. Habilitalas desde la configuración del sitio (candado en la barra de direcciones) para recibir avisos con sonido.'
                  : 'Activá las notificaciones con sonido en tu celular para enterarte apenas el estudio suba tus PDFs.'}
              </p>
            </div>
          </div>

          {estadoPush.permiso !== 'denied' && (
            <button
              type="button"
              disabled={activandoPush}
              onClick={handleActivarNotificaciones}
              className="w-full py-3 px-4 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark disabled:opacity-60 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.99]"
            >
              <BellRing className={`w-4 h-4 ${activandoPush ? 'animate-bounce' : ''}`} />
              <span>
                {activandoPush ? 'Activando notificaciones...' : 'Activar notificaciones en este celular'}
              </span>
            </button>
          )}
        </section>
      )}

      {/* 1. TARJETA DEL CLIENTE */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="bg-petroleo text-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-hueso bg-white/10 px-2.5 py-0.5 rounded-full">
                <Briefcase className="w-3 h-3" />
                {cliente.Actividad}
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight mt-2 leading-tight truncate">
                {cliente.Cliente}
              </h2>
              <p className="text-xs text-petroleo-100 font-mono mt-0.5">
                CUIT: {formatCUIT(cliente.CUIT)}
              </p>
            </div>

            <div className="flex flex-col items-center bg-white/10 border border-white/20 rounded-2xl px-3.5 py-2 shrink-0">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-hueso">
                Cat.
              </span>
              <span className="text-2xl font-black leading-none text-white mt-0.5">
                {cliente.Categoria_Actual}
              </span>
            </div>
          </div>
        </div>

        {/* Semáforo general (100% datos reales) */}
        <div className="p-4 space-y-2.5 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${semaforo.dot} ring-4 ring-slate-100`} />
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-800 truncate">{semaforo.texto}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  Ventas {calculos.porcentaje.toFixed(1)}% Cat. {cliente.Categoria_Actual} • Compras Art. 20: {calculos.porcentajeComprasArt20.toFixed(1)}%
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={irAlInformeReal}
              className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl border shrink-0 transition active:scale-95 ${semaforo.pill}`}
            >
              Ver detalle
            </button>
          </div>

          {onIrASimulador && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 font-medium">
                ¿Querés probar escenarios sin afectar tus datos reales?
              </span>
              <button
                type="button"
                onClick={onIrASimulador}
                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-petroleo hover:text-ladrillo shrink-0 transition"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Probar en Simulador</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 2. PRÓXIMO VENCIMIENTO */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-ladrillo-50 text-ladrillo flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-petroleo leading-tight">Próximo Vencimiento</h3>
              <p className="text-[11px] text-slate-500">Cuota mensual Monotributo</p>
            </div>
          </div>
          <span className={`text-xs font-extrabold px-3 py-1 rounded-full border ${estiloPago.cls}`}>
            {estiloPago.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 bg-[#F8FAFC] rounded-2xl p-3.5 border border-slate-200/70">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-500 block">Fecha límite</span>
            <p className="text-base font-black text-slate-900 mt-0.5">
              {formatFechaAR(cliente.Fecha_Proximo_Vencimiento)}
            </p>
            <span className="text-[11px] text-slate-500">Día {cliente.Dia_Vencimiento} de cada mes</span>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-bold uppercase text-slate-500 block">Importe cuota</span>
            <p className="text-base font-black text-petroleo mt-0.5">
              {formatARS(cliente.Importe_Cuota)}
            </p>
            <span className="text-[11px] text-slate-500">Cat. {cliente.Categoria_Actual}</span>
          </div>
        </div>
      </section>

      {/* 3. ACCESOS RÁPIDOS A TRÁMITES */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-1">
          Accesos rápidos a trámites
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModalVep(true)}
            className="bg-white hover:bg-petroleo-50/40 active:scale-[0.98] transition text-left rounded-3xl p-4 shadow-sm border border-slate-200/80 flex flex-col justify-between gap-3 min-h-[126px]"
          >
            <div className="w-11 h-11 rounded-2xl bg-petroleo text-white flex items-center justify-center shadow-sm">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-petroleo leading-tight">Pedir / Descargar VEP</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Monotributo, DGR Salta o Convenio
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setModalConstancia(true)}
            className="bg-white hover:bg-ladrillo-50/40 active:scale-[0.98] transition text-left rounded-3xl p-4 shadow-sm border border-slate-200/80 flex flex-col justify-between gap-3 min-h-[126px]"
          >
            <div className="w-11 h-11 rounded-2xl bg-ladrillo text-white flex items-center justify-center shadow-sm">
              <FileBadge2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-petroleo leading-tight">Constancia Monotributo</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Descargar PDF o enviar por WhatsApp
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* 3B. MIS DOCUMENTOS / DESCARGAS (SOLICITUDES APP PWA FILTRADAS POR CUIT) */}
      <section
        id="mis-documentos"
        ref={documentosRef}
        className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3.5 scroll-mt-20"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-petroleo-50 text-petroleo flex items-center justify-center shrink-0">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-petroleo leading-tight">
                Mis Documentos / Descargas
              </h3>
              <p className="text-[11px] text-slate-500">
                VEPs, Constancias y Facturas enviadas por el estudio
              </p>
            </div>
          </div>
          <span className="text-[11px] font-extrabold bg-petroleo-50 text-petroleo px-2.5 py-0.5 rounded-full border border-petroleo/15">
            {solicitudesDocumentos.length}
          </span>
        </div>

        {solicitudesDocumentos.length === 0 ? (
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/70 text-center text-xs text-slate-500">
            Todavía no tenés solicitudes ni documentos cargados. Cuando pidas un VEP, Constancia o Factura, el PDF para descargar aparecerá aquí.
          </div>
        ) : (
          <div className="space-y-3">
            {solicitudesDocumentos.map((doc) => {
              const estLower = String(doc.estado || '').toLowerCase();
              const esEnviado = estLower.includes('enviad');
              const esError = estLower.includes('rechaz') || estLower.includes('observ') || estLower.includes('cancel');
              const tienePdfListo = esEnviado && Boolean(doc.pdfUrl);

              const badgeCls = esEnviado
                ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                : esError
                  ? 'bg-red-100 text-red-900 border-red-200'
                  : 'bg-amber-100 text-amber-900 border-amber-200';

              return (
                <article
                  key={doc.id}
                  className={`rounded-2xl p-3.5 border space-y-2.5 ${
                    tienePdfListo
                      ? 'bg-emerald-50/35 border-emerald-200'
                      : 'bg-[#F8FAFC] border-slate-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-black text-petroleo leading-snug">
                        {doc.tipo}
                      </p>
                      {doc.fecha && (
                        <span className="text-[11px] text-slate-500 font-semibold">
                          {formatFechaAR(doc.fecha)}
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border shrink-0 ${badgeCls}`}
                    >
                      {esEnviado ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      <span>{doc.estado}</span>
                    </span>
                  </div>

                  {doc.detalle && (
                    <p className="text-xs font-semibold text-slate-700 leading-snug">
                      {doc.detalle}
                    </p>
                  )}

                  {doc.observacionesLimpias && (
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {doc.observacionesLimpias}
                    </p>
                  )}

                  {tienePdfListo && (
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDescargarDocumentoPdf(doc)}
                        className="py-3.5 px-3 rounded-2xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span>Descargar PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCompartirDocumentoPdf(doc)}
                        className="py-3.5 px-3 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
                      >
                        <Share2 className="w-4 h-4 shrink-0" />
                        <span>Compartir</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. BUZÓN DE ALERTAS ARCA (DOMICILIO FISCAL ELECTRÓNICO) */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-hueso text-petroleo flex items-center justify-center border border-hueso-border">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-petroleo leading-tight">
                Buzón de Alertas ARCA
              </h3>
              <p className="text-[11px] text-slate-500">Domicilio Fiscal Electrónico y avisos del estudio</p>
            </div>
          </div>
          <span className="text-[11px] font-extrabold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
            {alertasArca.length}
          </span>
        </div>

        {alertasArca.length === 0 ? (
          <div className="p-4 rounded-2xl bg-slate-50 text-center text-xs text-slate-500">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
            No tenés notificaciones pendientes en tu buzón fiscal.
          </div>
        ) : (
          <div className="space-y-2">
            {alertasArca.map((alerta) => {
              const abierta = alertaExpandida === alerta.id;
              return (
                <div
                  key={alerta.id}
                  className={`rounded-2xl border transition ${
                    alerta.prioridad === 'Alta'
                      ? 'bg-red-50/40 border-red-200/80'
                      : !alerta.leida
                        ? 'bg-hueso/45 border-hueso-border'
                        : 'bg-[#F8FAFC] border-slate-200/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setAlertaExpandida(abierta ? null : alerta.id)}
                    className="w-full p-3 text-left flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${badgePrioridad(alerta.prioridad)}`}>
                          {alerta.prioridad || 'Normal'}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {formatFechaAR(alerta.fecha)}
                        </span>
                      </div>
                      <p className="text-xs font-extrabold text-slate-900 leading-snug">
                        {alerta.titulo}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{alerta.origen}</p>
                    </div>
                    <span className="text-slate-400 mt-1 shrink-0">
                      {abierta ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>

                  {abierta && (
                    <div className="px-3 pb-3 pt-1 text-xs text-slate-700 leading-relaxed border-t border-slate-200/60">
                      {alerta.detalle}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ====================================================================
          5. MI INFORME REAL (ÚLTIMOS 12 MESES — 100% DATOS REALES)
         ==================================================================== */}
      <div ref={informeRealRef} className="space-y-4 pt-2 scroll-mt-20">
        <div className="flex items-center justify-between gap-2 px-1">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-ladrillo block">
              Estado real registrado
            </span>
            <h3 className="text-base sm:text-lg font-black text-petroleo leading-tight">
              Mi Informe (Últimos 12 meses)
            </h3>
            <p className="text-[11px] text-slate-500">
              Datos reales de planilla • Escalas ARCA (Factor IPC {FACTOR_IPC})
            </p>
          </div>
          {onActualizarInforme && (
            <button
              type="button"
              disabled={actualizando}
              onClick={onActualizarInforme}
              className="inline-flex items-center gap-1.5 bg-petroleo hover:bg-petroleo-dark disabled:opacity-60 text-white text-xs font-extrabold px-3.5 py-2.5 rounded-xl shadow-sm transition active:scale-95 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actualizando ? 'animate-spin' : ''}`} />
              <span>{actualizando ? 'Actualizando...' : 'Actualizar Informe'}</span>
            </button>
          )}
        </div>

        {/* ALERTA CRÍTICA REAL ART. 20 (SOLO SI LOS DATOS REALES SUPERAN 100%) */}
        {calculos.alertaExclusionGastos && (
          <div className="bg-red-600 text-white rounded-3xl p-4 shadow-lg border-2 border-red-300 space-y-2 animate-pulse-alert">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-hueso shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest bg-red-900/70 px-2 py-0.5 rounded text-hueso">
                  Art. 20 Ley Monotributo • {calculos.porcentajeComprasArt20.toFixed(1)}% del Tope Cat. K
                </span>
                <p className="text-xs sm:text-sm font-extrabold mt-1 leading-snug">
                  RIESGO DE EXCLUSIÓN: Tus compras/gastos reales ({formatARS(calculos.comprasTotales)}) superan en{' '}
                  {formatARS(calculos.excesoGastosArt20)} el límite del {calculos.porcLimiteTexto} sobre la Categoría K ({formatARS(calculos.limiteComprasArt20CatK)}).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ALERTA PREVENTIVA REAL ART. 20 (SOLO SI DATOS REALES ≥ 75%) */}
        {calculos.alertaPrecaucionGastos && (
          <div className="bg-amber-50 border-2 border-amber-400 text-amber-950 rounded-3xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <p className="font-black uppercase text-amber-800">
                Alerta Preventiva Art. 20 (≥ 75% de Categoría K)
              </p>
              <p className="font-semibold leading-snug">
                Llevás consumido el <strong>{calculos.porcentajeComprasArt20.toFixed(1)}%</strong> de tu límite anual real de compras ({calculos.porcLimiteTexto} sobre Cat. K: {formatARS(calculos.limiteComprasArt20CatK)}). Margen restante: <strong>{formatARS(calculos.margenGastosDisponible)}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* PANEL REAL 12M: KPIs + BARRAS DE PROGRESO CAT. ACTUAL Y CAT. K */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                Datos reales (Últimos 12 meses)
              </span>
              <h4 className="text-base font-black text-petroleo">
                Categoría {cliente.Categoria_Actual} • {cliente.Actividad}
              </h4>
            </div>
            <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full border ${calculos.bgBadge}`}>
              {calculos.tituloEstado}
            </span>
          </div>

          <div className={`p-3.5 rounded-2xl border-l-4 text-xs font-bold leading-relaxed ${calculos.bgBanner}`}>
            {calculos.mensajeSemaforo}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-petroleo-50/80 p-3.5 rounded-2xl border border-petroleo/20">
              <span className="text-[10px] font-extrabold uppercase text-petroleo block">Facturación 12M</span>
              <p className="text-base sm:text-lg font-black text-petroleo mt-0.5 whitespace-nowrap tabular-nums">
                {formatARS(calculos.ventasTotales)}
              </p>
              <span className="text-[11px] font-bold text-slate-600">
                {calculos.porcentaje.toFixed(1)}% de Cat. {cliente.Categoria_Actual}
              </span>
            </div>

            <div
              className={`p-3.5 rounded-2xl border ${
                calculos.alertaExclusionGastos
                  ? 'bg-red-50 border-red-300'
                  : calculos.alertaPrecaucionGastos
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-ladrillo-50 border-ladrillo/25'
              }`}
            >
              <span className="text-[10px] font-extrabold uppercase text-ladrillo-dark block">Compras / Gastos 12M</span>
              <p
                className={`text-base sm:text-lg font-black mt-0.5 whitespace-nowrap tabular-nums ${
                  calculos.alertaExclusionGastos ? 'text-red-700' : 'text-ladrillo'
                }`}
              >
                {formatARS(calculos.comprasTotales)}
              </p>
              <span className="text-[11px] font-bold text-slate-600">
                {calculos.porcentajeComprasArt20.toFixed(1)}% del lím. Cat. K
              </span>
            </div>
          </div>

          {/* Barra 1: Tope Categoría Actual */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold gap-2">
              <span className="text-petroleo">Tope Categoría {cliente.Categoria_Actual} (c/ IPC)</span>
              <span className="text-slate-700 whitespace-nowrap tabular-nums">{formatARS(calculos.topeCat)}</span>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  superaVentasCatActual
                    ? 'bg-red-600'
                    : precaucionVentas
                      ? 'bg-amber-500'
                      : 'bg-petroleo'
                }`}
                style={{ width: `${Math.min(100, calculos.porcentaje)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 font-semibold">
              <span>Consumido: {calculos.porcentaje.toFixed(1)}%</span>
              <span className="whitespace-nowrap tabular-nums">
                {superaVentasCatActual
                  ? `Exceso: ${formatARS(calculos.excesoCategoria)}`
                  : `Margen: ${formatARS(calculos.margenDisponible)}`}
              </span>
            </div>
          </div>

          {/* Barra 2: Tope Máximo Categoría K */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-bold gap-2">
              <span className="text-slate-700">Progreso frente a Categoría K (Tope Máximo)</span>
              <span className="text-slate-700 whitespace-nowrap tabular-nums">{formatARS(TOPE_MAXIMO_ANUAL)}</span>
            </div>
            <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  calculos.superaMaximoMonotributo ? 'bg-red-600' : 'bg-petroleo-light'
                }`}
                style={{ width: `${Math.min(100, calculos.porcentajeSobreCatK)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 font-semibold">
              <span>{calculos.porcentajeSobreCatK.toFixed(1)}% del máximo Monotributo</span>
              <span className="whitespace-nowrap tabular-nums">Margen hasta K: {formatARS(calculos.margenHastaCatK)}</span>
            </div>
          </div>
        </section>

        {/* REGLA ART. 20 REAL SOBRE CATEGORÍA K */}
        <section
          className={`bg-white rounded-3xl shadow-sm p-4 sm:p-5 space-y-3.5 border ${
            calculos.alertaExclusionGastos
              ? 'border-red-400 ring-2 ring-red-500/20'
              : calculos.alertaPrecaucionGastos
                ? 'border-amber-400'
                : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-ladrillo inline-flex items-center gap-1">
                <ShoppingBag className="w-3.5 h-3.5" />
                Regla de Exclusión Art. 20
              </span>
              <h4 className="text-sm sm:text-base font-black text-petroleo mt-0.5">
                Tope Compras y Gastos: {calculos.porcLimiteTexto} sobre Categoría K
              </h4>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-black border shrink-0 ${
                calculos.alertaExclusionGastos
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : calculos.alertaPrecaucionGastos
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
            >
              {calculos.porcentajeComprasArt20.toFixed(1)}%
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Para <strong>{cliente.Actividad}</strong> el tope de compras/gastos se calcula{' '}
            <strong>siempre sobre el tope anual de Categoría K</strong> ({formatARS(TOPE_CATEGORIA_K_VIGENTE)}):{' '}
            <strong className="text-petroleo">{formatARS(calculos.limiteComprasArt20CatK)}</strong> ({calculos.porcLimiteTexto}).
            Alerta preventiva al <strong>75%</strong> y crítica al <strong>100%</strong>.
          </p>

          <div className="bg-[#F8FAFC] p-3.5 rounded-2xl border border-slate-200 space-y-2">
            <div className="relative pt-5 pb-1">
              <div
                className="absolute top-0 -translate-x-1/2 z-20 flex flex-col items-center"
                style={{ left: '75%' }}
              >
                <span className="bg-amber-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                  ALERTA 75%
                </span>
              </div>
              <div className="w-full h-6 bg-petroleo/10 rounded-xl overflow-hidden relative border border-petroleo/25">
                <div
                  className={`h-full transition-all duration-500 flex items-center justify-end pr-2 text-[11px] font-black text-white ${
                    calculos.alertaExclusionGastos
                      ? 'bg-red-600'
                      : calculos.alertaPrecaucionGastos
                        ? 'bg-amber-500'
                        : 'bg-ladrillo'
                  }`}
                  style={{ width: `${Math.min(100, calculos.porcentajeComprasArt20)}%` }}
                >
                  {calculos.porcentajeComprasArt20 >= 12 && `${calculos.porcentajeComprasArt20.toFixed(1)}%`}
                </div>
              </div>
              <div className="absolute top-4 bottom-0 w-0.5 bg-amber-500 z-10" style={{ left: '75%' }} />
            </div>

            <div className="flex justify-between text-[11px] font-bold">
              <span className="text-ladrillo whitespace-nowrap tabular-nums">
                Acumulado: {formatARS(calculos.comprasTotales)}
              </span>
              <span className={`whitespace-nowrap tabular-nums ${calculos.alertaExclusionGastos ? 'text-red-700' : 'text-emerald-800'}`}>
                {calculos.alertaExclusionGastos
                  ? `Excedente: ${formatARS(calculos.excesoGastosArt20)}`
                  : `Margen: ${formatARS(calculos.margenGastosDisponible)}`}
              </span>
            </div>
          </div>
        </section>

        {/* SEMÁFORO DE MONOTRIBUTO REAL — DOS INDICADORES INDEPENDIENTES */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-extrabold uppercase text-ladrillo inline-flex items-center gap-1">
                <PieChart className="w-3.5 h-3.5" />
                Semáforo Real de Monotributo
              </span>
              <h4 className="text-sm sm:text-base font-black text-petroleo">
                Control independiente: Ventas vs. Gastos Art. 20
              </h4>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-xl shrink-0">
              <span className={`w-3 h-3 rounded-full ${calculos.estado === 'VERDE' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-emerald-950 opacity-40'}`} />
              <span className={`w-3 h-3 rounded-full ${calculos.estado === 'AMARILLO' ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]' : 'bg-amber-950 opacity-40'}`} />
              <span className={`w-3 h-3 rounded-full ${calculos.estado === 'ROJO' ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-red-950 opacity-40'}`} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-stretch">
            <div
              className={`flex flex-col h-full rounded-2xl p-3.5 border gap-2.5 ${
                superaVentasCatActual
                  ? 'bg-red-50/40 border-red-200'
                  : precaucionVentas
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-[#F8FAFC] border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2 sm:min-h-[68px]">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-petroleo block">
                    INDICADOR 1 · VENTAS
                  </span>
                  <h5 className="text-sm font-black text-slate-900 leading-snug mt-0.5">
                    Ingresos (Cat. {cliente.Categoria_Actual})
                  </h5>
                </div>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${badgeVentas.cls}`}>
                  {badgeVentas.texto}
                </span>
              </div>

              <DoughnutMedidorIndividual
                porcentaje={calculos.porcentaje}
                colorHex={colorVentasHex}
                etiquetaCentro={`Ventas Cat. ${cliente.Categoria_Actual}`}
                subetiquetaCentro="Tope c/ IPC"
                labelConsumido="% Ventas Cat. actual"
                labelRestante="% Margen ventas"
              />

              <div className="mt-auto space-y-1.5 text-[11px] bg-white rounded-xl p-2.5 border border-slate-200/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-semibold truncate">Facturado 12m:</span>
                  <strong className="text-petroleo font-black whitespace-nowrap tabular-nums shrink-0">
                    {formatARS(calculos.ventasTotales)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-semibold truncate">Tope Cat. {cliente.Categoria_Actual}:</span>
                  <strong className="text-slate-800 whitespace-nowrap tabular-nums shrink-0">
                    {formatARS(calculos.topeCat)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <span className="font-bold text-slate-700 truncate">
                    {superaVentasCatActual ? 'Excedente:' : 'Margen ventas:'}
                  </span>
                  <strong
                    className={`whitespace-nowrap tabular-nums shrink-0 ${
                      superaVentasCatActual ? 'text-red-700 font-black' : 'text-emerald-700 font-black'
                    }`}
                  >
                    {superaVentasCatActual
                      ? `-${formatARS(calculos.excesoCategoria)}`
                      : formatARS(calculos.margenDisponible)}
                  </strong>
                </div>
              </div>
            </div>

            <div
              className={`flex flex-col h-full rounded-2xl p-3.5 border gap-2.5 ${
                calculos.alertaExclusionGastos
                  ? 'bg-red-50/60 border-red-300'
                  : calculos.alertaPrecaucionGastos
                    ? 'bg-amber-50/50 border-amber-300'
                    : 'bg-[#F8FAFC] border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2 sm:min-h-[68px]">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-ladrillo block">
                    INDICADOR 2 · ART. 20
                  </span>
                  <h5 className="text-sm font-black text-slate-900 leading-snug mt-0.5">
                    Gastos ({calculos.porcLimiteTexto} Cat. K)
                  </h5>
                  <span className="text-[10px] font-semibold text-slate-500 block">
                    {calculos.esVentaBienes ? 'Venta de Bienes' : 'Servicios'}
                  </span>
                </div>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${badgeGastos.cls}`}>
                  {badgeGastos.texto}
                </span>
              </div>

              <DoughnutMedidorIndividual
                porcentaje={calculos.porcentajeComprasArt20}
                colorHex={colorGastosHex}
                etiquetaCentro={`Art. 20 (${calculos.porcLimiteTexto})`}
                subetiquetaCentro={calculos.esVentaBienes ? 'Cat. K · Bienes' : 'Cat. K · Servicios'}
                labelConsumido="% Gastos s/ Cat. K"
                labelRestante="% Margen gastos"
              />

              <div className="mt-auto space-y-1.5 text-[11px] bg-white rounded-xl p-2.5 border border-slate-200/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-semibold truncate">Gastos totales:</span>
                  <strong className="text-ladrillo font-black whitespace-nowrap tabular-nums shrink-0">
                    {formatARS(calculos.comprasTotales)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-semibold truncate">Tope {calculos.porcLimiteTexto} Cat. K:</span>
                  <strong className="text-slate-800 whitespace-nowrap tabular-nums shrink-0">
                    {formatARS(calculos.limiteComprasArt20CatK)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <span
                    className={`font-bold truncate ${
                      calculos.alertaExclusionGastos ? 'text-red-700' : 'text-slate-700'
                    }`}
                  >
                    {calculos.alertaExclusionGastos ? 'Excedente:' : 'Margen disponible:'}
                  </span>
                  <strong
                    className={`whitespace-nowrap tabular-nums shrink-0 ${
                      calculos.alertaExclusionGastos
                        ? 'text-red-700 font-black bg-red-100 px-1.5 py-0.5 rounded'
                        : 'text-emerald-700 font-black'
                    }`}
                  >
                    {calculos.alertaExclusionGastos
                      ? `-${formatARS(calculos.excesoGastosArt20)}`
                      : formatARS(calculos.margenGastosDisponible)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COMPARATIVA ANUAL REAL */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase text-ladrillo inline-flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5" />
              Comparativa Real Anual
            </span>
            <h4 className="text-sm font-black text-petroleo">
              Ventas vs. Compras y Límite {calculos.porcLimiteTexto} (Cat. K)
            </h4>
          </div>

          <BarComparativaChart
            ventasTotales={calculos.ventasTotales}
            comprasTotales={calculos.comprasTotales}
            limiteComprasAnual={calculos.limiteComprasArt20CatK}
            porcLimiteTexto={calculos.porcLimiteTexto}
          />
        </section>

        {/* RECOMENDACIONES + ACCESO OPCIONAL AL SIMULADOR */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-petroleo">
            Recomendaciones de GR Estudio
          </h4>
          <ul className="space-y-2">
            {calculos.recomendaciones.map((rec, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 bg-[#F8FAFC] p-3 rounded-2xl border border-slate-200/80 text-xs text-slate-700 font-medium leading-relaxed"
              >
                <CheckCircle2 className="w-4 h-4 text-petroleo shrink-0 mt-0.5" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>

          {onIrASimulador && (
            <button
              type="button"
              onClick={onIrASimulador}
              className="w-full py-3 px-4 rounded-2xl bg-petroleo-50 hover:bg-petroleo-100 text-petroleo font-extrabold text-xs border border-petroleo/20 flex items-center justify-center gap-2 transition"
            >
              <Calculator className="w-4 h-4 text-ladrillo" />
              <span>Probar escenarios en el Simulador</span>
            </button>
          )}
        </section>
      </div>

      {/* ====================================================================
          MODAL: PEDIR / DESCARGAR VEP
         ==================================================================== */}
      {modalVep && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-petroleo text-white px-5 py-4 flex items-center justify-between rounded-t-3xl">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-hueso" />
                <h4 className="font-extrabold text-base">Volante Electrónico de Pago (VEP)</h4>
              </div>
              <button
                type="button"
                onClick={() => setModalVep(false)}
                className="p-1 rounded-lg hover:bg-white/15"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Descargar último VEP disponible */}
              <div className="bg-hueso/70 border border-hueso-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-petroleo">
                    Último VEP disponible
                  </span>
                  <span className="text-[11px] font-bold text-slate-600">
                    Período {cliente.vepDisponible?.periodo || getPeriodoActual()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">
                    {cliente.vepDisponible?.impuesto || 'Monotributo Mensual'}
                  </p>
                  <p className="text-xs text-slate-700 mt-0.5">
                    Importe: <strong>{formatARS(cliente.vepDisponible?.importe || cliente.Importe_Cuota)}</strong> • Red:{' '}
                    <strong>{cliente.vepDisponible?.redPago || 'PagoMisCuentas'}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDescargarVep}
                  className="w-full py-3 px-4 rounded-xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar último VEP en PDF</span>
                </button>
              </div>

              {/* Solicitar nuevo VEP */}
              <form onSubmit={handleEnviarSolicitudVep} className="space-y-3.5">
                <div className="border-t border-slate-200 pt-3">
                  <h5 className="text-sm font-black text-petroleo">Solicitar nuevo VEP al estudio</h5>
                  <p className="text-xs text-slate-500">
                    Elegí el impuesto, período y red de pago que usás habitualmente.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Impuesto</label>
                  <select
                    value={vepImpuesto}
                    onChange={(e) => setVepImpuesto(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
                  >
                    {IMPUESTOS_VEP.map((imp) => (
                      <option key={imp} value={imp}>{imp}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">Período</label>
                    <input
                      type="month"
                      required
                      value={vepPeriodo}
                      onChange={(e) => setVepPeriodo(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">Red de pago</label>
                    <select
                      value={vepRed}
                      onChange={(e) => setVepRed(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
                    >
                      {REDES_PAGO.map((red) => (
                        <option key={red} value={red}>{red}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Aclaración (opcional)
                  </label>
                  <input
                    type="text"
                    value={vepNota}
                    onChange={(e) => setVepNota(e.target.value)}
                    placeholder="Ej: incluir intereses por mora o cuota de plan"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-petroleo"
                  />
                </div>

                <button
                  type="submit"
                  disabled={enviandoVep}
                  className="w-full py-3.5 px-4 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition"
                >
                  <Send className="w-4 h-4" />
                  <span>{enviandoVep ? 'Enviando solicitud...' : 'Solicitar nuevo VEP'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: CONSTANCIA DE MONOTRIBUTO / INSCRIPCIÓN
         ==================================================================== */}
      {modalConstancia && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-petroleo text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileBadge2 className="w-5 h-5 text-hueso" />
                <h4 className="font-extrabold text-base">Constancia de Monotributo</h4>
              </div>
              <button
                type="button"
                onClick={() => setModalConstancia(false)}
                className="p-1 rounded-lg hover:bg-white/15"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-4 space-y-1.5 text-xs">
                <p className="font-black text-petroleo text-sm">
                  {cliente.constanciaDisponible?.tipo || 'Constancia de Inscripción / Opción Monotributo'}
                </p>
                <p className="text-slate-600">
                  Titular: <strong>{cliente.Cliente}</strong>
                </p>
                <p className="text-slate-600">
                  CUIT: <strong className="font-mono">{formatCUIT(cliente.CUIT)}</strong> • Categoría{' '}
                  <strong>{cliente.Categoria_Actual}</strong>
                </p>
                {cliente.constanciaDisponible?.fechaEmision && (
                  <p className="text-slate-500">
                    Última emisión: {formatFechaAR(cliente.constanciaDisponible.fechaEmision)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDescargarConstancia}
                  className="py-3.5 px-3 rounded-2xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleCompartirConstancia}
                  className="py-3.5 px-3 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Compartir</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={enviandoConstancia}
                  onClick={handleSolicitarConstancia}
                  className="w-full py-3 px-4 rounded-2xl bg-hueso hover:bg-hueso-border/60 text-petroleo font-extrabold text-xs border border-hueso-border flex items-center justify-center gap-2 transition"
                >
                  <RefreshCw className={`w-4 h-4 ${enviandoConstancia ? 'animate-spin' : ''}`} />
                  <span>
                    {enviandoConstancia ? 'Enviando pedido...' : 'Solicitar constancia actualizada al estudio'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
