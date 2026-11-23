import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileBadge2,
  Receipt,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  X
} from 'lucide-react';
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
  onSolicitarVep,
  onSolicitarConstancia,
  onIrAInforme,
  onToast
}) {
  const [modalVep, setModalVep] = useState(false);
  const [modalConstancia, setModalConstancia] = useState(false);
  const [alertaExpandida, setAlertaExpandida] = useState(null);

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

        {/* Semáforo general */}
        <div className="p-4 flex items-center justify-between gap-3 bg-white">
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
            onClick={onIrAInforme}
            className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl border shrink-0 transition active:scale-95 ${semaforo.pill}`}
          >
            Ver detalle
          </button>
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
