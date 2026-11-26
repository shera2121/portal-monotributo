import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileMinus2,
  FilePlus2,
  Fingerprint,
  Share2,
  ShieldCheck,
  X,
  Zap
} from 'lucide-react';
import { ARCA_DIRECT_MODE, TOPE_CONSUMIDOR_FINAL } from '../config.js';
import { verificarBiometriaParaEmision } from '../utils/biometricAuth.js';
import {
  compartirDocumento,
  descargarBlob,
  generarPdfComprobante
} from '../utils/documentHelpers.js';
import {
  formatARS,
  formatFechaAR,
  getHoyISO,
  getRangoMesActual,
  parseMontoSeguro
} from '../utils/fiscalCalculations.js';
import { parsearDictadoFactura } from '../utils/voiceParser.js';
import VoiceInputButton from './VoiceInputButton.jsx';

const CONDICIONES_VENTA = [
  'Contado',
  'Transferencia / Mercado Pago',
  'Tarjeta de Débito',
  'Tarjeta de Crédito',
  'Cuenta Corriente'
];

function obtenerUrlPdfVenta(v = {}) {
  const directa = String(
    v.pdfUrl || v.urlPdf || v.enlacePdf || v.linkPdf || v.archivoUrl || v.url || ''
  ).trim();
  if (directa && /^https?:\/\//i.test(directa)) return directa;
  const obs = String(v.observaciones || v.Observaciones || v.observacion || '');
  const match = obs.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[.,;)\]]+$/, '') : '';
}

export default function FacturarTab({
  cliente = null,
  ventas = [],
  sesionPin = '',
  onSolicitarFactura,
  onToast
}) {
  const rangoMes = useMemo(() => getRangoMesActual(), []);

  const esModoAutomatico = Boolean(
    ARCA_DIRECT_MODE ||
      cliente?.facturacionAutomatica ||
      /autom[aá]tico|automatico_ws|direct/i.test(
        String(cliente?.Modalidad_ARCA || cliente?.Modo_Facturacion || '')
      )
  );

  const [tipoComprobante, setTipoComprobante] = useState('Factura C');
  const [facturaAsociada, setFacturaAsociada] = useState('');
  const [concepto, setConcepto] = useState('Servicios');
  const [fecha, setFecha] = useState(getHoyISO());
  const [fechaDesde, setFechaDesde] = useState(rangoMes.inicio);
  const [fechaHasta, setFechaHasta] = useState(rangoMes.fin);
  const [receptorTipo, setReceptorTipo] = useState('Consumidor Final');
  const [receptorDocumento, setReceptorDocumento] = useState('');
  const [receptorNombre, setReceptorNombre] = useState('');
  const [condicionVenta, setCondicionVenta] = useState('Transferencia / Mercado Pago');
  const [descripcion, setDescripcion] = useState('');
  const [importeStr, setImporteStr] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [avisoVoz, setAvisoVoz] = useState('');
  const [modalConfirmacion, setModalConfirmacion] = useState(false);
  const [errorModal, setErrorModal] = useState('');
  const [verificandoBio, setVerificandoBio] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const handleDictadoFactura = (transcript) => {
    const parsed = parsearDictadoFactura(transcript);
    setErrorForm('');

    if (parsed.tipoComprobante) setTipoComprobante(parsed.tipoComprobante);
    if (parsed.facturaAsociada) setFacturaAsociada(parsed.facturaAsociada);
    if (parsed.concepto) setConcepto(parsed.concepto);
    if (parsed.receptorTipo) setReceptorTipo(parsed.receptorTipo);
    if (parsed.receptorDocumento) setReceptorDocumento(parsed.receptorDocumento);
    if (parsed.condicionVenta) setCondicionVenta(parsed.condicionVenta);
    if (parsed.importe) setImporteStr(String(parsed.importe));
    if (parsed.descripcion) setDescripcion(parsed.descripcion);

    const resumenCampos =
      parsed.camposDetectados.length > 0 ? ` (${parsed.camposDetectados.join(', ')})` : '';
    setAvisoVoz(`Datos completados por voz, revisá y confirmá antes de enviar${resumenCampos}.`);
  };

  const importeNum = parseMontoSeguro(importeStr, 0);
  const superaTopeCF =
    receptorTipo === 'Consumidor Final' && importeNum >= TOPE_CONSUMIDOR_FINAL;

  const ultimas3 = useMemo(() => ventas.slice(0, 3), [ventas]);

  const validarYConfirmar = (e) => {
    e.preventDefault();
    setErrorForm('');

    if (tipoComprobante === 'Nota de Crédito C' && !facturaAsociada.trim()) {
      setErrorForm('Para emitir una Nota de Crédito C debés indicar el Número de Factura C asociada.');
      return;
    }
    if (concepto === 'Servicios' && (!fechaDesde || !fechaHasta)) {
      setErrorForm('Para Servicios indicá las fechas Desde y Hasta del período prestado.');
      return;
    }
    if (superaTopeCF) {
      setErrorForm(
        `El importe iguala o supera el tope normativo para Consumidor Final (${formatARS(TOPE_CONSUMIDOR_FINAL)}). Cambiá a "CUIT / DNI específico" e ingresá el documento del comprador.`
      );
      return;
    }
    if (receptorTipo === 'CUIT / DNI específico') {
      const docLimpio = receptorDocumento.replace(/\D/g, '');
      if (docLimpio.length < 7 || docLimpio.length > 11) {
        setErrorForm('Ingresá un DNI (7-8 dígitos) o CUIT (11 dígitos) válido para el receptor.');
        return;
      }
    }
    if (!descripcion.trim()) {
      setErrorForm('Escribí una breve descripción del servicio o producto.');
      return;
    }
    if (importeNum <= 0) {
      setErrorForm('Ingresá un importe total mayor a $ 0.');
      return;
    }

    setErrorModal('');
    setModalConfirmacion(true);
  };

  const handleVerDescargarPdfVenta = (v) => {
    const pdfUrl = obtenerUrlPdfVenta(v);
    if (pdfUrl && !pdfUrl.includes('/demo-')) {
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
      onToast?.('Abriendo PDF del comprobante...');
      return;
    }
    const blob = generarPdfComprobante(v, 'ventas', cliente);
    const nombre = `${String(v.tipoComprobante || 'Factura_C').replace(/\s+/g, '_')}_${v.numeroComprobante || v.id}.pdf`;
    descargarBlob(blob, nombre);
    onToast?.('PDF del comprobante descargado.');
  };

  const handleCompartirPdfVenta = async (v) => {
    const pdfUrl = obtenerUrlPdfVenta(v);
    const esUrlReal = Boolean(pdfUrl && !pdfUrl.includes('/demo-'));
    const blob = esUrlReal ? null : generarPdfComprobante(v, 'ventas', cliente);
    const titulo = `${v.tipoComprobante || 'Factura C'} ${v.numeroComprobante || ''}`.trim();
    const texto = `${titulo} • Fecha: ${formatFechaAR(v.fecha)} • Importe: ${formatARS(v.importe)}${v.cae ? ` • CAE: ${v.cae}` : ''}`;

    const res = await compartirDocumento({
      titulo,
      texto,
      url: esUrlReal ? pdfUrl : undefined,
      blob,
      nombreArchivo: `${titulo.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
    });
    if (res.shared) {
      onToast?.(
        res.method === 'clipboard-fallback'
          ? 'Enlace del PDF copiado para compartir.'
          : res.method === 'download-fallback'
            ? 'PDF descargado para compartir.'
            : 'Comprobante listo para compartir.'
      );
    }
  };

  const handleConfirmarEnvio = async () => {
    setErrorModal('');

    // En Modo Automático (AUTOMATICO_WS) se exige verificación biométrica OBLIGATORIA (WebAuthn)
    // sin ningún fallback ni bypass, tanto para Factura C como para Nota de Crédito C.
    let verificadoBiometricamente = false;
    let credentialIdVerificado = '';
    if (esModoAutomatico) {
      setVerificandoBio(true);
      try {
        const bioRes = await verificarBiometriaParaEmision({
          cuit: cliente?.CUIT || '',
          pin: sesionPin || '',
          nombre: cliente?.Cliente || ''
        });
        if (!bioRes || bioRes.ok !== true || bioRes.verified !== true || !bioRes.credentialId) {
          setErrorModal(
            `No se pudo verificar tu huella dactilar. La emisión de la ${tipoComprobante} fue bloqueada por seguridad.`
          );
          return;
        }
        verificadoBiometricamente = true;
        credentialIdVerificado = String(bioRes.credentialId);
      } catch (err) {
        setErrorModal(
          err?.message ||
            `No se pudo validar tu huella dactilar. La emisión de la ${tipoComprobante} fue bloqueada por seguridad.`
        );
        return;
      } finally {
        setVerificandoBio(false);
      }

      // Candado duro: jamás continuar si no quedó verificada la biometría
      if (verificadoBiometricamente !== true || !credentialIdVerificado) {
        setErrorModal(
          `Emisión bloqueada: se requiere huella dactilar verificada para emitir la ${tipoComprobante}.`
        );
        return;
      }
    }

    setEnviando(true);
    try {
      await onSolicitarFactura({
        tipoComprobante,
        facturaAsociada: tipoComprobante === 'Nota de Crédito C' ? facturaAsociada.trim() : '',
        concepto,
        fecha,
        fechaDesde: concepto === 'Servicios' ? fechaDesde : '',
        fechaHasta: concepto === 'Servicios' ? fechaHasta : '',
        receptorTipo,
        receptorDocumento: receptorTipo === 'CUIT / DNI específico' ? receptorDocumento.trim() : '',
        receptorNombre:
          receptorTipo === 'CUIT / DNI específico'
            ? receptorNombre.trim() || receptorDocumento.trim()
            : 'Consumidor Final',
        condicionVenta,
        descripcion: descripcion.trim(),
        importe: importeNum,
        estado: 'Solicitada',
        arcaDirectMode: esModoAutomatico,
        modalidadArca: cliente?.Modalidad_ARCA || (esModoAutomatico ? 'AUTOMATICO_WS' : 'MANUAL_WEB'),
        modoFacturacion: esModoAutomatico ? 'AUTOMATICO_WS' : 'MANUAL_WEB',
        verificacionBiometrica: verificadoBiometricamente,
        biometricCredentialId: credentialIdVerificado
      });
      setModalConfirmacion(false);
      setDescripcion('');
      setImporteStr('');
      setFacturaAsociada('');
      if (receptorTipo === 'CUIT / DNI específico') {
        setReceptorDocumento('');
        setReceptorNombre('');
      }
    } catch (err) {
      setErrorModal(err?.message || `No se pudo procesar la ${tipoComprobante}.`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-black text-petroleo leading-tight">
              {esModoAutomatico ? 'Emitir Comprobante ARCA' : 'Solicitar Comprobante'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {esModoAutomatico
                ? 'Modo Automático activo: te pediremos tu huella o PIN biométrico antes de emitir.'
                : 'Tu solicitud ingresa al estudio para revisión y emisión segura en ARCA.'}
            </p>
          </div>
          {esModoAutomatico && (
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-full shrink-0">
              <Zap className="w-3 h-3" />
              Automático
            </span>
          )}
        </div>

        {/* DICTADO INTELIGENTE POR VOZ (es-AR) */}
        <VoiceInputButton
          titulo="Dictar factura por voz"
          ejemplo="Ej: Factura C a Consumidor Final por servicios de diseño, 120.000 pesos por transferencia"
          onResultadoFinal={handleDictadoFactura}
        />

        {avisoVoz && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-900 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{avisoVoz}</span>
            </div>
            <button
              type="button"
              onClick={() => setAvisoVoz('')}
              className="text-emerald-700 hover:text-emerald-950 shrink-0"
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 1. Selector Factura C / Nota de Crédito C */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setTipoComprobante('Factura C')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
              tipoComprobante === 'Factura C'
                ? 'bg-petroleo text-white shadow-sm'
                : 'text-slate-600 hover:text-petroleo'
            }`}
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Factura C</span>
          </button>
          <button
            type="button"
            onClick={() => setTipoComprobante('Nota de Crédito C')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
              tipoComprobante === 'Nota de Crédito C'
                ? 'bg-ladrillo text-white shadow-sm'
                : 'text-slate-600 hover:text-ladrillo'
            }`}
          >
            <FileMinus2 className="w-4 h-4" />
            <span>Nota de Crédito C</span>
          </button>
        </div>

        {/* 2. Formulario guiado */}
        <form onSubmit={validarYConfirmar} className="space-y-4">
          {tipoComprobante === 'Nota de Crédito C' && (
            <div className="p-3.5 rounded-2xl bg-ladrillo-50 border border-ladrillo/30 space-y-1.5">
              <label className="block text-xs font-extrabold text-ladrillo-dark">
                Número de Factura C asociada *
              </label>
              <input
                type="text"
                required
                value={facturaAsociada}
                onChange={(e) => setFacturaAsociada(e.target.value)}
                placeholder="Ej: 0002-00000418"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-ladrillo/40 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:border-ladrillo"
              />
            </div>
          )}

          {/* Concepto y Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">Concepto</label>
              <div className="grid grid-cols-2 gap-1.5">
                {['Servicios', 'Productos'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setConcepto(c)}
                    className={`py-2.5 rounded-xl text-xs font-extrabold border-2 transition ${
                      concepto === c
                        ? 'bg-petroleo-50 border-petroleo text-petroleo'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Fecha comprobante
              </label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
              />
            </div>
          </div>

          {concepto === 'Servicios' && (
            <div className="grid grid-cols-2 gap-3 bg-[#F8FAFC] p-3 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  Servicio Desde
                </label>
                <input
                  type="date"
                  required
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
                />
              </div>
              <div>
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  Servicio Hasta
                </label>
                <input
                  type="date"
                  required
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
                />
              </div>
            </div>
          )}

          {/* Receptor */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-700">Receptor</label>
              <span className="text-[10px] font-semibold text-slate-500">
                Tope sin DNI: {formatARS(TOPE_CONSUMIDOR_FINAL)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['Consumidor Final', 'CUIT / DNI específico'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setReceptorTipo(opt)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-extrabold border-2 transition ${
                    receptorTipo === opt
                      ? 'bg-petroleo-50 border-petroleo text-petroleo'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {receptorTipo === 'CUIT / DNI específico' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={receptorDocumento}
                  onChange={(e) => setReceptorDocumento(e.target.value)}
                  placeholder="CUIT o DNI del cliente *"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-bold focus:outline-none focus:border-petroleo"
                />
                <input
                  type="text"
                  value={receptorNombre}
                  onChange={(e) => setReceptorNombre(e.target.value)}
                  placeholder="Nombre o Razón Social (opc.)"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-medium focus:outline-none focus:border-petroleo"
                />
              </div>
            )}

            {superaTopeCF && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="font-extrabold">
                    Supera el tope para Consumidor Final ({formatARS(TOPE_CONSUMIDOR_FINAL)}).
                  </p>
                  <p className="text-[11px]">
                    Por normativa ARCA debés identificar al receptor con DNI o CUIT.
                  </p>
                  <button
                    type="button"
                    onClick={() => setReceptorTipo('CUIT / DNI específico')}
                    className="text-[11px] font-extrabold bg-amber-600 text-white px-3 py-1 rounded-lg"
                  >
                    Cargar DNI / CUIT ahora
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Condición de venta */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Condición de venta
            </label>
            <select
              value={condicionVenta}
              onChange={(e) => setCondicionVenta(e.target.value)}
              className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
            >
              {CONDICIONES_VENTA.map((cv) => (
                <option key={cv} value={cv}>{cv}</option>
              ))}
            </select>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Descripción del comprobante *
            </label>
            <textarea
              rows={2}
              required
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Honorarios por servicios de diseño y consultoría — Noviembre 2026"
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-petroleo resize-none"
            />
          </div>

          {/* Importe Total */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Importe Total ($) *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-petroleo font-black text-lg">
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                required
                value={importeStr}
                onChange={(e) => setImporteStr(e.target.value)}
                placeholder="Ej: 450000"
                className="w-full pl-9 pr-4 py-3.5 rounded-2xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-lg font-black text-petroleo focus:outline-none focus:border-petroleo"
              />
            </div>
            {importeNum > 0 && (
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                Total formateado: <strong className="text-petroleo">{formatARS(importeNum)}</strong>
              </p>
            )}
          </div>

          {errorForm && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorForm}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark text-white font-extrabold text-sm shadow-md transition active:scale-[0.99]"
          >
            Solicitar {tipoComprobante}
          </button>
        </form>
      </section>

      {/* 3. ÚLTIMAS 3 SOLICITUDES */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-petroleo">Últimas 3 solicitudes</h3>
          <span className="text-[11px] font-bold text-slate-500">Estado en tiempo real</span>
        </div>

        {ultimas3.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4 bg-slate-50 rounded-2xl">
            Todavía no hay solicitudes de comprobantes registradas.
          </p>
        ) : (
          <div className="space-y-2.5">
            {ultimas3.map((v) => {
              const emitida = String(v.estado || '').toLowerCase().includes('emitida') || Boolean(v.cae);
              return (
                <div
                  key={v.id}
                  className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-petroleo">
                      {v.tipoComprobante}{' '}
                      {v.numeroComprobante && !v.numeroComprobante.includes('Pendiente')
                        ? `• ${v.numeroComprobante}`
                        : ''}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                        emitida
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-900 border-amber-200'
                      }`}
                    >
                      {emitida ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {emitida ? 'Emitida con CAE' : 'Solicitada'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {v.receptorNombre || v.receptorTipo} — {v.descripcion}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <span>
                      {formatFechaAR(v.fecha)}
                      {v.cae ? ` • CAE: ${v.cae}` : ''}
                    </span>
                    <strong className="text-sm font-black text-slate-900">{formatARS(v.importe)}</strong>
                  </div>

                  {emitida && (
                    <div className="grid grid-cols-2 gap-2 pt-1.5">
                      <button
                        type="button"
                        onClick={() => handleVerDescargarPdfVenta(v)}
                        className="py-2.5 px-3 rounded-xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>Ver / Descargar PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCompartirPdfVenta(v)}
                        className="py-2.5 px-3 rounded-xl bg-ladrillo hover:bg-ladrillo-dark text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Compartir</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL CONFIRMACIÓN SEGURA */}
      {modalConfirmacion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-petroleo text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-hueso" />
                <h4 className="font-extrabold text-base">Confirmar solicitud</h4>
              </div>
              <button
                type="button"
                onClick={() => setModalConfirmacion(false)}
                className="p-1 rounded-lg hover:bg-white/15"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* En modo MANUAL_WEB muestra el cartel amarillo de revisión del estudio; en AUTOMATICO_WS se oculta */}
              {!esModoAutomatico ? (
                <div className="rounded-2xl p-3 flex items-start gap-2.5 text-xs border bg-hueso/80 border-hueso-border text-petroleo">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-ladrillo" />
                  <p>
                    Por seguridad, el comprobante se envía como <strong>“Solicitada”</strong> para que el estudio verifique los datos antes de emitir en ARCA.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl p-3 flex items-start gap-2.5 text-xs border bg-petroleo-50 border-petroleo/25 text-petroleo">
                  <Fingerprint className="w-4 h-4 shrink-0 mt-0.5 text-ladrillo" />
                  <p>
                    <strong>Emisión automática ARCA con seguridad biométrica:</strong> al confirmar te pediremos tu{' '}
                    <strong>huella, rostro o PIN del celular</strong> antes de emitir la <strong>{tipoComprobante}</strong>.
                  </p>
                </div>
              )}

              {errorModal && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorModal}</span>
                </div>
              )}

              <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
                <FilaResumen label="Comprobante" valor={tipoComprobante} destacado />
                {tipoComprobante === 'Nota de Crédito C' && (
                  <FilaResumen label="Factura asociada" valor={facturaAsociada} />
                )}
                <FilaResumen label="Fecha" valor={formatFechaAR(fecha)} />
                <FilaResumen
                  label="Concepto"
                  valor={
                    concepto === 'Servicios'
                      ? `Servicios (${formatFechaAR(fechaDesde)} al ${formatFechaAR(fechaHasta)})`
                      : 'Productos'
                  }
                />
                <FilaResumen
                  label="Receptor"
                  valor={
                    receptorTipo === 'Consumidor Final'
                      ? 'Consumidor Final'
                      : `${receptorNombre || 'Cliente'} (${receptorDocumento})`
                  }
                />
                <FilaResumen label="Condición" valor={condicionVenta} />
                <FilaResumen label="Descripción" valor={descripcion} />
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="font-extrabold text-slate-700">Importe Total</span>
                  <span className="text-lg font-black text-petroleo">{formatARS(importeNum)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setModalConfirmacion(false)}
                  className="py-3.5 rounded-2xl border-2 border-slate-200 text-slate-700 font-extrabold text-xs hover:bg-slate-50"
                >
                  Editar datos
                </button>
                <button
                  type="button"
                  disabled={enviando || verificandoBio}
                  onClick={handleConfirmarEnvio}
                  className="py-3.5 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark disabled:opacity-60 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5"
                >
                  {esModoAutomatico && <Fingerprint className="w-4 h-4 shrink-0" />}
                  <span>
                    {verificandoBio
                      ? 'Validando huella...'
                      : enviando
                        ? esModoAutomatico
                          ? 'Emitiendo en ARCA...'
                          : 'Enviando...'
                        : esModoAutomatico
                          ? 'Validar huella y Emitir'
                          : 'Confirmar envío'}
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

function FilaResumen({ label, valor, destacado = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500 font-semibold shrink-0">{label}:</span>
      <span className={`text-right ${destacado ? 'font-black text-petroleo' : 'font-bold text-slate-800'}`}>
        {valor}
      </span>
    </div>
  );
}
