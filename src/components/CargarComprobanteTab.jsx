import React, { useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  ImagePlus,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { CASO_PRUEBA_DUPLICADO } from '../data/mockData.js';
import { detectarComprobanteDuplicado } from '../utils/antiDuplicate.js';
import {
  formatARS,
  formatFechaAR,
  getHoyISO,
  parseMontoSeguro
} from '../utils/fiscalCalculations.js';
import { formatBytes, prepararArchivoComprobante } from '../utils/imageCompressor.js';
import { parsearDictadoComprobante } from '../utils/voiceParser.js';
import LoadingOverlay from './LoadingOverlay.jsx';
import VoiceInputButton from './VoiceInputButton.jsx';

const CLASIFICACIONES = [
  'Compra / Proveedor',
  'Gasto operativo',
  'Resumen Bancario / Mercado Pago',
  'Pago VEP / Monotributo',
  'Pago Honorarios',
  'Ticket / Otro'
];

const PATRON_ARCHIVO_EXTRACTO =
  /\.csv$|extracto|resumen|movimientos|mercadopago|mercado.?pago|galicia|santander|macro|bbva/i;

function normalizarClasificacionIA(valor) {
  if (!valor) return '';
  const v = String(valor).trim().toLowerCase();
  const exacta = CLASIFICACIONES.find((c) => c.toLowerCase() === v);
  if (exacta) return exacta;
  if (v.includes('vep') || v.includes('monotributo')) return 'Pago VEP / Monotributo';
  if (v.includes('honorario')) return 'Pago Honorarios';
  if (v.includes('resumen') || v.includes('bancar') || v.includes('mercado pago') || v.includes('concili')) {
    return 'Resumen Bancario / Mercado Pago';
  }
  if (v.includes('compra') || v.includes('proveedor')) return 'Compra / Proveedor';
  if (v.includes('gasto')) return 'Gasto operativo';
  return 'Ticket / Otro';
}

export default function CargarComprobanteTab({
  comprasGastos = [],
  modoDemo = false,
  onAnalizarComprobante,
  onSubirComprobante,
  onIrAHistorial,
  onToast
}) {
  const inputCamaraRef = useRef(null);
  const inputGaleriaRef = useRef(null);

  const [archivo, setArchivo] = useState(null);
  const [procesandoArchivo, setProcesandoArchivo] = useState(false);

  // Campos principales del comprobante
  const [clasificacion, setClasificacion] = useState('');
  const [fecha, setFecha] = useState(getHoyISO());
  const [importeStr, setImporteStr] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [cuitEmisor, setCuitEmisor] = useState('');
  const [numeroComprobante, setNumeroComprobante] = useState('');
  const [observacion, setObservacion] = useState('');

  // Campos fiscales detectados por IA
  const [tipoComprobante, setTipoComprobante] = useState('');
  const [tipoOperacion, setTipoOperacion] = useState('');
  const [cae, setCae] = useState('');
  const [netoGravadoStr, setNetoGravadoStr] = useState('');
  const [iva21Str, setIva21Str] = useState('');
  const [iva105Str, setIva105Str] = useState('');
  const [otrosTributosStr, setOtrosTributosStr] = useState('');
  const [mostrarDetallesIA, setMostrarDetallesIA] = useState(false);

  // Estados de lectura IA, voz, conciliación y envío
  const [analizandoIA, setAnalizandoIA] = useState(false);
  const [avisoIA, setAvisoIA] = useState('');
  const [errorIA, setErrorIA] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [avisoVoz, setAvisoVoz] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultadoConciliacion, setResultadoConciliacion] = useState(null);

  // Estado del validador anti-duplicados
  const [alertaDuplicadoModal, setAlertaDuplicadoModal] = useState(null);
  const [confirmadoDistinto, setConfirmadoDistinto] = useState(false);

  const importeNum = parseMontoSeguro(importeStr, 0);
  const esModoConciliacion =
    clasificacion === 'Resumen Bancario / Mercado Pago' ||
    String(tipoOperacion || '').toUpperCase() === 'CONCILIACION';

  // Detección EN TIEMPO REAL (no bloquea extractos bancarios/MP en Modo Conciliación)
  const chequeoTiempoReal = useMemo(() => {
    if (esModoConciliacion) {
      return { isDuplicate: false, regla: null, motivo: '', matchedReceipt: null };
    }
    return detectarComprobanteDuplicado(
      {
        archivoNombre: archivo?.nombre || '',
        archivoTamano: archivo?.tamanoOriginal || 0,
        fecha,
        importe: importeNum,
        proveedor,
        cuitEmisor,
        numeroComprobante
      },
      comprasGastos
    );
  }, [esModoConciliacion, archivo, fecha, importeNum, proveedor, cuitEmisor, numeroComprobante, comprasGastos]);

  const limpiarFormulario = ({ mantenerResultadoConciliacion = false } = {}) => {
    setArchivo(null);
    setClasificacion('');
    setFecha(getHoyISO());
    setImporteStr('');
    setProveedor('');
    setCuitEmisor('');
    setNumeroComprobante('');
    setObservacion('');
    setTipoComprobante('');
    setTipoOperacion('');
    setCae('');
    setNetoGravadoStr('');
    setIva21Str('');
    setIva105Str('');
    setOtrosTributosStr('');
    setMostrarDetallesIA(false);
    setAnalizandoIA(false);
    setAvisoIA('');
    setErrorIA('');
    setErrorForm('');
    setAvisoVoz('');
    setAlertaDuplicadoModal(null);
    setConfirmadoDistinto(false);
    if (!mantenerResultadoConciliacion) {
      setResultadoConciliacion(null);
    }
    if (inputCamaraRef.current) inputCamaraRef.current.value = '';
    if (inputGaleriaRef.current) inputGaleriaRef.current.value = '';
  };

  const aplicarDatosIA = (datos = {}) => {
    if (!datos || typeof datos !== 'object') return;
    setConfirmadoDistinto(false);

    const esConciliacionIA = String(datos.tipoOperacion || '').toUpperCase() === 'CONCILIACION';

    if (esConciliacionIA) {
      setClasificacion('Resumen Bancario / Mercado Pago');
      setTipoOperacion('CONCILIACION');
      const entidadDetectada = datos.entidad || datos.proveedor || '';
      if (entidadDetectada) setProveedor(String(entidadDetectada));

      const movs = datos.cantidadMovimientos ?? datos.movimientosDetectados ?? datos.movimientos;
      const partesObs = [];
      if (datos.periodo) partesObs.push(`Período ${datos.periodo}`);
      if (movs) partesObs.push(`${movs} movimientos detectados`);
      const obsAuto = datos.observacion ? String(datos.observacion) : partesObs.join(' — ');
      if (obsAuto) setObservacion(obsAuto);
      if (datos.fecha) setFecha(String(datos.fecha).slice(0, 10));
      return;
    }

    if (datos.clasificacion) setClasificacion(normalizarClasificacionIA(datos.clasificacion));
    if (datos.tipoComprobante !== undefined && datos.tipoComprobante !== null) {
      setTipoComprobante(String(datos.tipoComprobante));
    }
    if (datos.tipoOperacion !== undefined && datos.tipoOperacion !== null) {
      setTipoOperacion(String(datos.tipoOperacion));
    }
    if (datos.fecha) setFecha(String(datos.fecha).slice(0, 10));
    if (datos.importe !== undefined && datos.importe !== null && datos.importe !== '') {
      setImporteStr(String(datos.importe));
    }
    if (datos.proveedor || datos.entidad) setProveedor(String(datos.proveedor || datos.entidad));
    if (datos.cuitEmisor) setCuitEmisor(String(datos.cuitEmisor));
    if (datos.numeroComprobante) setNumeroComprobante(String(datos.numeroComprobante));
    if (datos.cae) setCae(String(datos.cae));
    if (datos.netoGravado !== undefined && datos.netoGravado !== null && datos.netoGravado !== '') {
      setNetoGravadoStr(String(datos.netoGravado));
    }
    if (datos.iva21 !== undefined && datos.iva21 !== null && datos.iva21 !== '') {
      setIva21Str(String(datos.iva21));
    }
    if (datos.iva105 !== undefined && datos.iva105 !== null && datos.iva105 !== '') {
      setIva105Str(String(datos.iva105));
    }
    if (datos.otrosTributos !== undefined && datos.otrosTributos !== null && datos.otrosTributos !== '') {
      setOtrosTributosStr(String(datos.otrosTributos));
    }
    if (datos.observacion) setObservacion(String(datos.observacion));

    const hayFiscales = Boolean(
      datos.cae ||
        datos.cuitEmisor ||
        datos.tipoComprobante ||
        datos.netoGravado ||
        datos.iva21 ||
        datos.iva105 ||
        datos.otrosTributos
    );
    if (hayFiscales) setMostrarDetallesIA(true);
  };

  const ejecutarLecturaIA = async (archivoObj) => {
    if (!onAnalizarComprobante || !archivoObj?.base64) return;
    setAnalizandoIA(true);
    setAvisoIA('');
    setErrorIA('');
    try {
      const res = await onAnalizarComprobante({
        archivoBase64: archivoObj.base64,
        archivoTipo: archivoObj.tipo || 'image/jpeg',
        archivoNombre: archivoObj.nombre || 'comprobante.jpg',
        observacion: observacion.trim()
      });

      const datos = res?.datos || res?.data || null;
      if (res?.ok && datos) {
        aplicarDatosIA(datos);
        setAvisoIA('✨ Datos leídos con IA — revisá y tocá Enviar');
      } else {
        setErrorIA('No se pudieron leer datos automáticamente. Podés enviar igual el archivo o completar los campos.');
      }
    } catch {
      setErrorIA('No se pudo analizar con IA en este momento. Igual podés enviar el comprobante y el estudio lo procesa.');
    } finally {
      setAnalizandoIA(false);
    }
  };

  const handleSeleccionarArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorForm('');
    setAvisoIA('');
    setErrorIA('');
    setResultadoConciliacion(null);
    setConfirmadoDistinto(false);
    setProcesandoArchivo(true);
    try {
      const proc = await prepararArchivoComprobante(file);
      setArchivo(proc);

      // Autodetectar extractos bancarios o Mercado Pago por nombre o extensión .csv
      if (proc.esCsv || PATRON_ARCHIVO_EXTRACTO.test(proc.nombre || '')) {
        setClasificacion('Resumen Bancario / Mercado Pago');
        setTipoOperacion('CONCILIACION');
      }

      if (proc.comprimido) {
        onToast(`Foto optimizada (${formatBytes(proc.tamanoOriginal)} → ${formatBytes(proc.tamanoFinal)}).`);
      }
      setProcesandoArchivo(false);
      // Disparo automático de lectura con IA apenas termina de cargarse el archivo
      await ejecutarLecturaIA(proc);
    } catch (err) {
      setProcesandoArchivo(false);
      setErrorForm(err.message || 'No se pudo cargar el archivo.');
    }
  };

  const handleDictadoComprobante = (transcript) => {
    const parsed = parsearDictadoComprobante(transcript);
    setErrorForm('');
    setConfirmadoDistinto(false);

    if (parsed.clasificacion) setClasificacion(parsed.clasificacion);
    if (parsed.fecha) setFecha(parsed.fecha);
    if (parsed.importe) setImporteStr(String(parsed.importe));
    if (parsed.proveedor) setProveedor(parsed.proveedor);
    if (parsed.numeroComprobante) setNumeroComprobante(parsed.numeroComprobante);
    if (parsed.observacion) setObservacion(parsed.observacion);

    const resumenCampos =
      parsed.camposDetectados.length > 0 ? ` (${parsed.camposDetectados.join(', ')})` : '';
    setAvisoVoz(`Datos del comprobante completados por voz, revisá y confirmá${resumenCampos}.`);
  };

  const cargarEjemploDuplicado = () => {
    setResultadoConciliacion(null);
    setTipoOperacion('');
    setClasificacion('Gasto operativo');
    setFecha(CASO_PRUEBA_DUPLICADO.fecha);
    setImporteStr(String(CASO_PRUEBA_DUPLICADO.importe));
    setProveedor(CASO_PRUEBA_DUPLICADO.proveedor);
    setNumeroComprobante(CASO_PRUEBA_DUPLICADO.numeroComprobante);
    setObservacion('Prueba de detector anti-duplicados');
    setArchivo({
      nombre: CASO_PRUEBA_DUPLICADO.archivoNombre,
      tipo: 'application/pdf',
      tamanoOriginal: 184320,
      tamanoFinal: 184320,
      comprimido: false,
      esPdf: true,
      esCsv: false,
      previewUrl: '',
      base64: ''
    });
    setConfirmadoDistinto(false);
    setErrorForm('');
  };

  const ejecutarEnvioReal = async (fueConfirmadoDistinto = false) => {
    setEnviando(true);
    try {
      const res = await onSubirComprobante({
        clasificacion: clasificacion || '',
        tipoComprobante: tipoComprobante.trim(),
        tipoOperacion: esModoConciliacion ? 'CONCILIACION' : tipoOperacion.trim(),
        fecha: fecha || '',
        importe: esModoConciliacion ? (importeStr ? importeNum : 0) : importeStr ? importeNum : 0,
        proveedor: proveedor.trim(),
        entidad: esModoConciliacion ? proveedor.trim() : '',
        cuitEmisor: cuitEmisor.trim(),
        numeroComprobante: numeroComprobante.trim(),
        cae: cae.trim(),
        netoGravado: netoGravadoStr ? parseMontoSeguro(netoGravadoStr, 0) : 0,
        iva21: iva21Str ? parseMontoSeguro(iva21Str, 0) : 0,
        iva105: iva105Str ? parseMontoSeguro(iva105Str, 0) : 0,
        otrosTributos: otrosTributosStr ? parseMontoSeguro(otrosTributosStr, 0) : 0,
        observacion: observacion.trim(),
        archivoNombre: archivo?.nombre || 'sin-adjunto.jpg',
        archivoTipo: archivo?.tipo || 'image/jpeg',
        archivoTamano: archivo?.tamanoOriginal || 0,
        archivoTamanoComprimido: archivo?.tamanoFinal || 0,
        archivoBase64: archivo?.base64 || '',
        archivoPreview: archivo?.previewUrl || '',
        confirmadoDistinto: fueConfirmadoDistinto
      });

      if (res?.resumenConciliacion) {
        setResultadoConciliacion(res.resumenConciliacion);
        limpiarFormulario({ mantenerResultadoConciliacion: true });
      } else {
        limpiarFormulario();
      }
    } catch {
      // El toast de error ya lo muestra App.jsx
    } finally {
      setEnviando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorForm('');

    // Solo el archivo es obligatorio: si algún campo queda vacío, el servidor aplica respaldo IA
    if (!archivo) {
      setErrorForm('Sacá una foto o subí el PDF, CSV o imagen del comprobante antes de enviar.');
      return;
    }

    // FRENO CRÍTICO ANTI-DUPLICADOS ANTES DE SUBIR (solo para tickets/facturas, no extractos)
    if (!esModoConciliacion && chequeoTiempoReal.isDuplicate && !confirmadoDistinto) {
      setAlertaDuplicadoModal(chequeoTiempoReal);
      return;
    }

    await ejecutarEnvioReal(confirmadoDistinto);
  };

  const tieneDatosFiscalesIA = Boolean(
    tipoComprobante || tipoOperacion || cuitEmisor || cae || netoGravadoStr || iva21Str || iva105Str || otrosTributosStr
  );

  const mensajeOverlayCarga = procesandoArchivo
    ? 'Optimizando imagen...'
    : analizandoIA
      ? 'Analizando comprobante con IA...'
      : enviando
        ? 'Enviando comprobante al Estudio...'
        : '';

  return (
    <div className="space-y-4">
      <LoadingOverlay visible={Boolean(mensajeOverlayCarga)} message={mensajeOverlayCarga} />
      {/* TARJETA DE RESULTADO DE CONCILIACIÓN (SI EL SERVIDOR DEVUELVE resumenConciliacion) */}
      {resultadoConciliacion && (
        <section className="bg-white rounded-3xl shadow-md border-2 border-emerald-400 overflow-hidden">
          <div className="bg-petroleo text-white px-5 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-300/40 flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5 text-hueso" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-hueso block">
                  Conciliación completada
                </span>
                <h3 className="text-base font-black leading-tight truncate">
                  {resultadoConciliacion.entidad || 'Extracto Bancario / Mercado Pago'}
                </h3>
              </div>
            </div>
            {resultadoConciliacion.periodo && (
              <span className="text-xs font-extrabold bg-white/15 px-2.5 py-1 rounded-xl shrink-0">
                {resultadoConciliacion.periodo}
              </span>
            )}
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Contadores de movimientos */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-3 text-center">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 block">
                  Movimientos procesados
                </span>
                <strong className="text-2xl font-black text-petroleo tabular-nums">
                  {resultadoConciliacion.movimientosProcesados ?? 0}
                </strong>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                <span className="text-[10px] font-extrabold uppercase text-emerald-700 block">
                  Conciliados OK
                </span>
                <strong className="text-2xl font-black text-emerald-800 tabular-nums">
                  {resultadoConciliacion.conciliadosOk ?? 0}
                </strong>
              </div>
            </div>

            {/* Totales en pesos argentinos */}
            <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-600">Total Haber (Ingresos):</span>
                <strong className="font-black text-petroleo whitespace-nowrap tabular-nums">
                  {formatARS(resultadoConciliacion.totalHaber)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-600">Total Debe (Egresos):</span>
                <strong className="font-black text-slate-800 whitespace-nowrap tabular-nums">
                  {formatARS(resultadoConciliacion.totalDebe)}
                </strong>
              </div>
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700">Ingresos sin facturar:</span>
                  <strong
                    className={`font-black whitespace-nowrap tabular-nums ${
                      Number(resultadoConciliacion.ingresosSinFacturar) > 0
                        ? 'text-red-700 bg-red-100 px-2 py-0.5 rounded-lg'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatARS(resultadoConciliacion.ingresosSinFacturar)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700">Egresos sin comprobante:</span>
                  <strong
                    className={`font-black whitespace-nowrap tabular-nums ${
                      Number(resultadoConciliacion.egresosSinComprobante) > 0
                        ? 'text-amber-900 bg-amber-100 px-2 py-0.5 rounded-lg'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatARS(resultadoConciliacion.egresosSinComprobante)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setResultadoConciliacion(null)}
                className="py-3 px-3 rounded-2xl border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-xs transition"
              >
                Cargar otro archivo
              </button>
              {onIrAHistorial && (
                <button
                  type="button"
                  onClick={onIrAHistorial}
                  className="py-3 px-3 rounded-2xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs shadow-sm transition"
                >
                  Ver en Historial
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-black text-petroleo leading-tight">Cargar Comprobante</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Subí tickets, facturas o extractos bancarios/MP (.pdf, .csv o foto).
            </p>
          </div>

          {modoDemo && (
            <button
              type="button"
              onClick={cargarEjemploDuplicado}
              className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-hueso hover:bg-hueso-border/70 text-petroleo border border-hueso-border px-2.5 py-1.5 rounded-xl shrink-0 transition"
              title="Completa los datos de EDESA para probar la alerta anti-duplicados"
            >
              <FlaskConical className="w-3.5 h-3.5 text-ladrillo" />
              <span>Probar duplicado</span>
            </button>
          )}
        </div>

        {/* ALERTA EN TIEMPO REAL SI COINCIDE CON UN COMPROBANTE PREVIO (DESACTIVADA EN MODO CONCILIACIÓN) */}
        {!esModoConciliacion && chequeoTiempoReal.isDuplicate && !confirmadoDistinto && (
          <div className="rounded-2xl bg-red-50 border-2 border-red-400 p-3.5 space-y-2.5 animate-pulse-alert">
            <div className="flex items-start gap-2.5">
              <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-950 space-y-1">
                <p className="font-black uppercase tracking-wide text-red-700">
                  Posible comprobante duplicado detectado
                </p>
                <p className="font-semibold">{chequeoTiempoReal.motivo}</p>
              </div>
            </div>

            {chequeoTiempoReal.matchedReceipt && (
              <div className="bg-white rounded-xl p-2.5 border border-red-200 text-[11px] text-slate-700 space-y-0.5">
                <p className="font-extrabold text-petroleo">
                  Comprobante previo: {chequeoTiempoReal.matchedReceipt.proveedor}
                </p>
                <p>
                  Fecha: <strong>{formatFechaAR(chequeoTiempoReal.matchedReceipt.fecha)}</strong> • Importe:{' '}
                  <strong>{formatARS(chequeoTiempoReal.matchedReceipt.importe)}</strong>
                </p>
                <p>
                  N°: <strong className="font-mono">{chequeoTiempoReal.matchedReceipt.numeroComprobante || 'S/N'}</strong> • Estado:{' '}
                  <strong>{chequeoTiempoReal.matchedReceipt.estado}</strong>
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  limpiarFormulario();
                  onToast('Carga cancelada. Se evitó subir un comprobante repetido.');
                }}
                className="py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs transition"
              >
                Cancelar (ya lo envié)
              </button>
              <button
                type="button"
                onClick={() => setConfirmadoDistinto(true)}
                className="py-2.5 px-3 rounded-xl bg-white hover:bg-red-100 text-red-800 border border-red-300 font-extrabold text-xs transition"
              >
                Confirmar: es un comprobante distinto
              </button>
            </div>
          </div>
        )}

        {confirmadoDistinto && !esModoConciliacion && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900 flex items-center justify-between gap-2">
            <span>Confirmaste que es un comprobante distinto. Podés continuar con la carga.</span>
            <button
              type="button"
              onClick={() => setConfirmadoDistinto(false)}
              className="underline text-[11px] shrink-0"
            >
              Revisar
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. CAPTURA: SACAR FOTO / SUBIR PDF, CSV O GALERÍA */}
          <div className="space-y-2.5">
            <label className="block text-xs font-extrabold uppercase tracking-wide text-petroleo">
              1. Foto o archivo del comprobante *
            </label>

            {/* Inputs ocultos */}
            <input
              ref={inputCamaraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleSeleccionarArchivo}
              className="hidden"
            />
            <input
              ref={inputGaleriaRef}
              type="file"
              accept="image/*,application/pdf,.csv,text/csv"
              onChange={handleSeleccionarArchivo}
              className="hidden"
            />

            {!archivo ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={procesandoArchivo || analizandoIA || enviando}
                  onClick={() => inputCamaraRef.current?.click()}
                  className="py-5 px-3 rounded-2xl border-2 border-dashed border-ladrillo/60 bg-ladrillo-50/70 hover:bg-ladrillo-50 disabled:opacity-50 text-ladrillo-dark flex flex-col items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  <div className="w-11 h-11 rounded-2xl bg-ladrillo text-white flex items-center justify-center shadow-sm">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black">Sacar foto</span>
                  <span className="text-[10px] text-slate-500 font-semibold">Lectura automática IA</span>
                </button>

                <button
                  type="button"
                  disabled={procesandoArchivo || analizandoIA || enviando}
                  onClick={() => inputGaleriaRef.current?.click()}
                  className="py-5 px-3 rounded-2xl border-2 border-dashed border-petroleo/40 bg-petroleo-50/60 hover:bg-petroleo-50 disabled:opacity-50 text-petroleo flex flex-col items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  <div className="w-11 h-11 rounded-2xl bg-petroleo text-white flex items-center justify-center shadow-sm">
                    <ImagePlus className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black">Subir PDF / Galería</span>
                  <span className="text-[10px] text-slate-500 font-semibold">PDF, CSV, JPG o PNG</span>
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-petroleo/30 bg-[#F8FAFC] p-3 space-y-2.5">
                <div className="flex items-center gap-3">
                  {archivo.esCsv ? (
                    <div className="w-14 h-14 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-7 h-7 text-hueso" />
                    </div>
                  ) : archivo.esPdf || !archivo.previewUrl ? (
                    <div className="w-14 h-14 rounded-xl bg-petroleo text-white flex items-center justify-center shrink-0">
                      <FileText className="w-7 h-7 text-hueso" />
                    </div>
                  ) : (
                    <img
                      src={archivo.previewUrl}
                      alt="Vista previa del comprobante"
                      className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-petroleo truncate">{archivo.nombre}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {archivo.esCsv
                        ? 'Extracto CSV (Conciliación)'
                        : archivo.esPdf
                          ? 'Documento PDF'
                          : 'Imagen lista'}{' '}
                      •{' '}
                      {archivo.comprimido ? (
                        <span className="text-emerald-700 font-bold">
                          Optimizada ({formatBytes(archivo.tamanoOriginal)} → {formatBytes(archivo.tamanoFinal)})
                        </span>
                      ) : (
                        formatBytes(archivo.tamanoFinal)
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setArchivo(null);
                      setAvisoIA('');
                      setErrorIA('');
                      setConfirmadoDistinto(false);
                    }}
                    className="p-2 rounded-xl text-red-600 hover:bg-red-50 transition"
                    aria-label="Quitar archivo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {!archivo.esPdf && !archivo.esCsv && archivo.previewUrl && (
                  <img
                    src={archivo.previewUrl}
                    alt="Comprobante cargado"
                    className="w-full max-h-48 object-contain rounded-xl bg-white border border-slate-200"
                  />
                )}
              </div>
            )}

            {procesandoArchivo && (
              <p className="text-xs font-bold text-petroleo text-center">
                Procesando archivo...
              </p>
            )}

            {/* INDICADOR DE LECTURA AUTOMÁTICA CON IA */}
            {analizandoIA && (
              <div className="p-3 rounded-2xl bg-petroleo-50 border border-petroleo/25 text-xs font-extrabold text-petroleo flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-ladrillo shrink-0" />
                <span>✨ Leyendo comprobante con IA...</span>
              </div>
            )}

            {/* AVISO COMPACTO CUANDO LA IA COMPLETÓ LOS DATOS + BOTÓN DISCRETO RE-LEER */}
            {!analizandoIA && avisoIA && (
              <div className="p-2.5 px-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-900 flex items-center justify-between gap-2">
                <span className="leading-snug">{avisoIA}</span>
                {archivo?.base64 && (
                  <button
                    type="button"
                    onClick={() => ejecutarLecturaIA(archivo)}
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold text-petroleo bg-white hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-xl shrink-0 transition"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Re-leer con IA</span>
                  </button>
                )}
              </div>
            )}

            {/* AVISO AMIGABLE SI FALLÓ LA LECTURA IA + REINTENTO */}
            {!analizandoIA && errorIA && (
              <div className="p-2.5 px-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-950 flex items-center justify-between gap-2">
                <span className="leading-snug">{errorIA}</span>
                {archivo?.base64 && (
                  <button
                    type="button"
                    onClick={() => ejecutarLecturaIA(archivo)}
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold text-petroleo bg-white hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-xl shrink-0 transition"
                  >
                    <Sparkles className="w-3 h-3 text-ladrillo" />
                    <span>Re-leer con IA</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. DICTADO RÁPIDO POR VOZ (SE OCULTA SI ESTÁ EN MODO CONCILIACIÓN PARA SIMPLIFICAR) */}
          {!esModoConciliacion && (
            <div className="space-y-2">
              <VoiceInputButton
                titulo="Dictar datos del ticket por voz"
                ejemplo="Ej: Gasto de EDESA, 45.800 pesos, hoy, factura 0012-00458912"
                onResultadoFinal={handleDictadoComprobante}
              />
              {avisoVoz && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{avisoVoz}</span>
                </div>
              )}
            </div>
          )}

          {/* 3. CLASIFICACIÓN (SE AUTOCOMPLETA CON IA / EXTENSIÓN CSV) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-extrabold uppercase tracking-wide text-petroleo">
                2. Clasificación
              </label>
              <span className="text-[10px] font-semibold text-slate-400">
                Autocompletada por IA (opcional)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CLASIFICACIONES.map((item) => {
                const seleccionada = clasificacion === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setClasificacion(item);
                      if (item === 'Resumen Bancario / Mercado Pago') {
                        setTipoOperacion('CONCILIACION');
                      } else if (tipoOperacion === 'CONCILIACION') {
                        setTipoOperacion('');
                      }
                    }}
                    className={`p-3 rounded-2xl border-2 text-left text-xs font-extrabold transition leading-snug ${
                      seleccionada
                        ? 'bg-petroleo text-white border-petroleo shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-petroleo/40'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AVISO CLARO DE MODO CONCILIACIÓN */}
          {esModoConciliacion && (
            <div className="p-3.5 rounded-2xl bg-hueso border border-hueso-border text-xs font-bold text-petroleo leading-relaxed">
              🏦 <strong>Modo Conciliación:</strong> el estudio cruzará los ingresos y egresos del extracto contra tus facturas y compras.
            </div>
          )}

          {/* 4. DATOS DEL COMPROBANTE (SIMPLIFICADO EN MODO CONCILIACIÓN) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-extrabold uppercase tracking-wide text-petroleo">
                {esModoConciliacion ? '3. Datos del extracto' : '3. Datos del comprobante'}
              </label>
              <span className="text-[10px] font-semibold text-slate-400">
                {esModoConciliacion ? 'Campos opcionales' : 'Podés enviar solo con la foto/PDF'}
              </span>
            </div>

            {esModoConciliacion ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Entidad / Banco / Billetera
                    </label>
                    <input
                      type="text"
                      value={proveedor}
                      onChange={(e) => setProveedor(e.target.value)}
                      placeholder="Ej: Mercado Pago, Banco Macro, Galicia..."
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Fecha de referencia (opc.)
                    </label>
                    <input
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Período / Observación
                  </label>
                  <input
                    type="text"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    placeholder="Ej: Período 2026-11 — 34 movimientos detectados"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-petroleo"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={fecha}
                      onChange={(e) => {
                        setFecha(e.target.value);
                        setConfirmadoDistinto(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Importe ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-petroleo text-sm">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={importeStr}
                        onChange={(e) => {
                          setImporteStr(e.target.value);
                          setConfirmadoDistinto(false);
                        }}
                        placeholder="45800"
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-black text-petroleo focus:outline-none focus:border-petroleo"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Proveedor / Emisor
                    </label>
                    <input
                      type="text"
                      value={proveedor}
                      onChange={(e) => {
                        setProveedor(e.target.value);
                        setConfirmadoDistinto(false);
                      }}
                      placeholder="Ej: EDESA S.A. o CUIT"
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-petroleo"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      N° de Comprobante
                    </label>
                    <input
                      type="text"
                      value={numeroComprobante}
                      onChange={(e) => {
                        setNumeroComprobante(e.target.value);
                        setConfirmadoDistinto(false);
                      }}
                      placeholder="Ej: 0012-00458912"
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-mono font-semibold focus:outline-none focus:border-petroleo"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Observación (opcional)
                  </label>
                  <input
                    type="text"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    placeholder="Ej: Servicio eléctrico estudio, compra de insumos..."
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-petroleo"
                  />
                </div>

                {/* BLOQUE DESPLEGABLE DE DETALLES FISCALES DETECTADOS POR IA */}
                <div className="rounded-2xl border border-slate-200 bg-[#F8FAFC] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMostrarDetallesIA((prev) => !prev)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-extrabold text-petroleo hover:bg-slate-100/70 transition"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-ladrillo" />
                      <span>
                        Datos fiscales detallados (CUIT, CAE, IVA){tieneDatosFiscalesIA ? ' • Detectados' : ''}
                      </span>
                    </span>
                    {mostrarDetallesIA ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {mostrarDetallesIA && (
                    <div className="p-3.5 pt-1 border-t border-slate-200/80 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Tipo comprobante</label>
                          <input
                            type="text"
                            value={tipoComprobante}
                            onChange={(e) => setTipoComprobante(e.target.value)}
                            placeholder="Ej: Factura A / B / C"
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Tipo operación</label>
                          <input
                            type="text"
                            value={tipoOperacion}
                            onChange={(e) => setTipoOperacion(e.target.value)}
                            placeholder="Compra / Gasto"
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">CUIT Emisor</label>
                          <input
                            type="text"
                            value={cuitEmisor}
                            onChange={(e) => {
                              setCuitEmisor(e.target.value);
                              setConfirmadoDistinto(false);
                            }}
                            placeholder="30-XXXXXXXX-X"
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold focus:outline-none focus:border-petroleo"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">CAE</label>
                          <input
                            type="text"
                            value={cae}
                            onChange={(e) => setCae(e.target.value)}
                            placeholder="14 dígitos"
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold focus:outline-none focus:border-petroleo"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Neto Gravado</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={netoGravadoStr}
                            onChange={(e) => setNetoGravadoStr(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-petroleo"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">IVA 21%</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={iva21Str}
                            onChange={(e) => setIva21Str(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-petroleo"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">IVA 10,5%</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={iva105Str}
                            onChange={(e) => setIva105Str(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-petroleo"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Otros Tributos</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={otrosTributosStr}
                            onChange={(e) => setOtrosTributosStr(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-petroleo"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
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
            disabled={enviando || procesandoArchivo || analizandoIA}
            className="w-full py-4 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark disabled:opacity-60 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            <UploadCloud className="w-5 h-5" />
            <span>
              {analizandoIA
                ? 'Esperando lectura con IA...'
                : enviando
                  ? esModoConciliacion
                    ? 'Procesando extracto...'
                    : 'Enviando al estudio...'
                  : esModoConciliacion
                    ? 'Enviar Extracto para Conciliación'
                    : 'Enviar Comprobante al Estudio'}
            </span>
          </button>
        </form>
      </section>

      {/* MODAL BLOQUEANTE ANTI-DUPLICADOS AL INTENTAR ENVIAR */}
      {alertaDuplicadoModal && !esModoConciliacion && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border-t-4 border-red-600">
            <div className="bg-red-600 text-white px-5 py-4 flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <div>
                <h4 className="font-black text-base leading-tight">¡Alto! Comprobante ya enviado</h4>
                <p className="text-[11px] text-red-100">Control anti-duplicados de GR Estudio</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs font-bold text-slate-800 leading-relaxed">
                {alertaDuplicadoModal.motivo}
              </p>

              {alertaDuplicadoModal.matchedReceipt && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 space-y-1.5 text-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-700">
                    Comprobante ya registrado en tu historial
                  </span>
                  <p className="font-black text-slate-900">
                    {alertaDuplicadoModal.matchedReceipt.proveedor}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 pt-1">
                    <span>Fecha: <strong>{formatFechaAR(alertaDuplicadoModal.matchedReceipt.fecha)}</strong></span>
                    <span>Importe: <strong>{formatARS(alertaDuplicadoModal.matchedReceipt.importe)}</strong></span>
                    <span>N°: <strong className="font-mono">{alertaDuplicadoModal.matchedReceipt.numeroComprobante || 'S/N'}</strong></span>
                    <span>Estado: <strong>{alertaDuplicadoModal.matchedReceipt.estado}</strong></span>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    limpiarFormulario();
                    onToast('Carga cancelada para evitar duplicados.');
                  }}
                  className="w-full py-3.5 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm shadow-sm transition"
                >
                  Cancelar (ya lo envié)
                </button>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={async () => {
                    setAlertaDuplicadoModal(null);
                    setConfirmadoDistinto(true);
                    await ejecutarEnvioReal(true);
                  }}
                  className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 text-petroleo border-2 border-petroleo font-extrabold text-xs transition"
                >
                  Confirmar: es un comprobante distinto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
