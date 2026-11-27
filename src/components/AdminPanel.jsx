import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Cpu,
  Database,
  Eye,
  EyeOff,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Globe,
  Inbox,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
  Wrench,
  X
} from 'lucide-react';
import {
  adminAnalizarDocumento,
  adminCerebroChat,
  adminEjecutarAccionNivel2,
  adminHealthcheck,
  adminLogin,
  adminLogout,
  adminVerifySession
} from '../services/api.js';
import { cleanCUIT, formatARS, formatCUIT } from '../utils/fiscalCalculations.js';
import { formatBytes, prepararArchivoComprobante } from '../utils/imageCompressor.js';
import {
  eliminarStorageSeguro,
  guardarJsonSeguro,
  leerJsonSeguro
} from '../utils/storage.js';
import LoadingOverlay from './LoadingOverlay.jsx';

const ADMIN_SESSION_KEY = 'gr_cerebro_admin_session_v1';

const ICONOS_COMPONENTE = {
  portal: Smartphone,
  bot1: Bot,
  bot2: Cpu,
  arca: Globe
};

const PLANILLAS_FALLBACK = [
  { id: 'registro_comprobantes', nombre: 'DEV_Registro de Comprobantes', propiedad: '' },
  { id: 'ganancias_autonomo', nombre: 'DEV Ganancias Autónomo', propiedad: 'SHEET_ID_GANANCIAS' },
  { id: 'excel_maestro', nombre: 'Excel Maestro', propiedad: 'SHEET_ID_MAESTRO' },
  { id: 'control_vencimientos', nombre: 'Control de Vencimientos', propiedad: 'SHEET_ID_VENCIMIENTOS' },
  { id: 'control_alertas_arca', nombre: 'Control de Alertas ARCA', propiedad: 'SHEET_ID_ALERTAS_ARCA' },
  { id: 'convenio_multilateral', nombre: 'Convenio Multilateral', propiedad: 'SHEET_ID_CONVENIO' },
  { id: 'errepar_4ta', nombre: 'Errepar, retenciones 4ta categoría', propiedad: 'SHEET_ID_ERREPAR_4TA' }
];

const CONSULTAS_RAPIDAS_CEREBRO = [
  '¿Qué clientes tienen VEP pendiente de revisión?',
  'Mostrame el estado de honorarios pendientes',
  'Revisá alertas de ARCA y próximos vencimientos',
  'Revisá criterios y normativa vigente del estudio'
];

const ETIQUETAS_HERRAMIENTAS = {
  buscar_cliente: 'Buscar cliente',
  consultar_veps: 'Consultar VEPs',
  consultar_honorarios: 'Consultar honorarios',
  consultar_vencimientos_y_alertas: 'Vencimientos y Alertas ARCA',
  consultar_normativa: 'Base de Conocimiento / Normativa'
};

function renderTextoFormateadoIA(texto) {
  const lineas = String(texto || '').split('\n');
  return lineas.map((linea, idx) => {
    const trimmed = linea.trim();
    if (!trimmed) return <div key={idx} className="h-2" />;

    // Renderizar **negritas** inline de forma segura sin dangerouslySetInnerHTML
    const partes = linea.split(/(\*\*[^*]+\*\*)/g).map((seg, sIdx) => {
      if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
        return (
          <strong key={sIdx} className="font-extrabold text-slate-900">
            {seg.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={sIdx}>{seg}</React.Fragment>;
    });

    const esBullet = /^[-•*]\s+/.test(trimmed);
    return (
      <p key={idx} className={esBullet ? 'pl-2 leading-relaxed' : 'leading-relaxed'}>
        {partes}
      </p>
    );
  });
}

function obtenerEstiloEstado(statusRaw) {
  const st = String(statusRaw || '').toUpperCase();
  if (st === 'OK') {
    return {
      label: 'Operativo',
      badgeCls: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      dotCls: 'bg-emerald-500',
      borderCls: 'border-emerald-200/90',
      Icon: CheckCircle2
    };
  }
  if (st === 'SIN_ID') {
    return {
      label: 'Pendiente de ID',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-200',
      dotCls: 'bg-amber-500',
      borderCls: 'border-amber-200/90',
      Icon: Clock
    };
  }
  if (st === 'ERROR') {
    return {
      label: 'Error',
      badgeCls: 'bg-red-100 text-red-900 border-red-200',
      dotCls: 'bg-red-600',
      borderCls: 'border-red-300',
      Icon: AlertCircle
    };
  }
  return {
    label: 'Consultando...',
    badgeCls: 'bg-slate-100 text-slate-600 border-slate-200',
    dotCls: 'bg-slate-400',
    borderCls: 'border-slate-200/80',
    Icon: Clock
  };
}

export default function AdminPanel() {
  const [sesionAdmin, setSesionAdmin] = useState(null);
  const [verificandoSesion, setVerificandoSesion] = useState(() => {
    const guardada = leerJsonSeguro(ADMIN_SESSION_KEY, null);
    return Boolean(guardada?.sessionToken);
  });

  const [masterKey, setMasterKey] = useState('');
  const [mostrarClave, setMostrarClave] = useState(false);
  const [autenticando, setAutenticando] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [error, setError] = useState('');

  // Estado del diagnóstico en tiempo real (Etapa 2 — Nivel 1 solo lectura)
  const [healthData, setHealthData] = useState(null);
  const [cargandoDiagnostico, setCargandoDiagnostico] = useState(false);
  const [errorDiagnostico, setErrorDiagnostico] = useState('');
  const [planillasExpandidas, setPlanillasExpandidas] = useState({});

  // Estado del Chat Central — GR Cerebro de IA (Etapa 3/4 — Nivel 1 Function Calling)
  const [mensajesChat, setMensajesChat] = useState([]);
  const [inputChat, setInputChat] = useState('');
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [errorChat, setErrorChat] = useState('');
  const chatEndRef = useRef(null);

  // Estado del Validador Documental OCR/PDF — Etapa 4 (Nivel 1 Solo Lectura)
  const inputDocAdminRef = useRef(null);
  const [archivoDoc, setArchivoDoc] = useState(null);
  const [preparandoDoc, setPreparandoDoc] = useState(false);
  const [analizandoDoc, setAnalizandoDoc] = useState(false);
  const [resultadoDoc, setResultadoDoc] = useState(null);
  const [errorDoc, setErrorDoc] = useState('');

  // Estado de la Bandeja de Acciones Sugeridas — Etapa 5 (Nivel 2 con aprobación humana obligatoria)
  const bandejaNivel2Ref = useRef(null);
  const [accionesNivel2, setAccionesNivel2] = useState([]);
  const [ejecutandoAccionId, setEjecutandoAccionId] = useState('');
  const [avisoNivel2, setAvisoNivel2] = useState('');
  const [errorNivel2, setErrorNivel2] = useState('');
  const [tabGeneradorN2, setTabGeneradorN2] = useState('estado_pago'); // 'estado_pago' | 'normativa' | 'borrador_msg'

  // Formulario rápido 1: Proponer cambio de estado VEP u Honorario
  const [propTipoPago, setPropTipoPago] = useState('actualizar_estado_vep');
  const [propCuit, setPropCuit] = useState('');
  const [propClienteNombre, setPropClienteNombre] = useState('');
  const [propPeriodo, setPropPeriodo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [propNuevoEstado, setPropNuevoEstado] = useState('PAGADO');
  const [propObservacion, setPropObservacion] = useState('');

  // Formulario rápido 2: Proponer nueva regla normativa
  const [reglaTema, setReglaTema] = useState('');
  const [reglaCategoria, setReglaCategoria] = useState('Monotributo');
  const [reglaContenido, setReglaContenido] = useState('');
  const [reglaVigenciaDesde, setReglaVigenciaDesde] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });
  const [reglaFuente, setReglaFuente] = useState('');

  // Formulario rápido 3: Borrador de mensaje WhatsApp/Telegram (copia manual controlada)
  const [msgPlantilla, setMsgPlantilla] = useState('vep_pendiente');
  const [msgCliente, setMsgCliente] = useState('');
  const [msgPeriodo, setMsgPeriodo] = useState(() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });
  const [msgImporte, setMsgImporte] = useState('');
  const [msgCopiado, setMsgCopiado] = useState(false);

  const borradorMensajeTexto = (() => {
    const saludo = msgCliente.trim() ? `Hola ${msgCliente.trim()},` : 'Hola,';
    const perTxt = msgPeriodo.trim() ? ` correspondiente al período ${msgPeriodo.trim()}` : '';
    const impTxt = msgImporte.trim() ? ` por ${msgImporte.trim()}` : '';

    if (msgPlantilla === 'honorarios_pendientes') {
      return `${saludo} te escribimos desde GR Servicios Contables para recordarte que registrás honorarios profesionales pendientes${perTxt}${impTxt}. Cuando realices la transferencia, por favor envianos el comprobante por la app o por este medio para actualizar tu cuenta. ¡Muchas gracias!`;
    }
    if (msgPlantilla === 'pago_confirmado') {
      return `${saludo} te confirmamos desde GR Servicios Contables que verificamos y registramos tu pago${perTxt}${impTxt} como PAGADO en tu cuenta. ¡Gracias por mantener tu situación al día!`;
    }
    return `${saludo} te escribimos desde GR Servicios Contables para recordarte que tenés tu VEP pendiente${perTxt}${impTxt}. Podés descargarlo desde tu Portal de Autogestión (Historial → Documentos) o avisarnos si necesitás que te lo reenviemos. Una vez abonado, subí el comprobante para registrarlo como pagado. ¡Saludos!`;
  })();

  const agregarAccionABandejaNivel2 = (accionObj) => {
    setErrorNivel2('');
    setAvisoNivel2('');
    const nueva = {
      id: `N2-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      creadoEn: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      ...accionObj
    };
    setAccionesNivel2((prev) => [nueva, ...prev]);
    setAvisoNivel2('Propuesta agregada a la Bandeja Nivel 2. Revisala y tocá "Aprobar y Ejecutar" para aplicar el cambio.');
    setTimeout(() => {
      bandejaNivel2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const handleEnviarDocABandejaNivel2 = () => {
    const cli = resultadoDoc?.crucePlanillas?.clienteEncontrado;
    const ext = resultadoDoc?.datosExtraidos;
    if (!cli || !ext) return;

    const tipoNorm = String(ext.tipo_documento || '').toLowerCase();
    const esHonorario = /honorario|estudio|recibo/.test(tipoNorm) && !/vep|monotrib/.test(tipoNorm);
    const tipoAccion = esHonorario ? 'actualizar_estado_honorario' : 'actualizar_estado_vep';
    const estadoAnterior = esHonorario ? cli.estadoHonorarios : cli.estadoMesActualVep;
    const cuitCli = cleanCUIT(cli.cuit || ext.cuit);

    agregarAccionABandejaNivel2({
      tipoAccion,
      tituloAccion: esHonorario ? 'Actualizar Estado de Honorarios' : 'Actualizar Estado VEP',
      clienteNombre: cli.cliente,
      cuit: cuitCli,
      hojaDestino: esHonorario
        ? 'Directorio Clientes + Control Honorarios'
        : 'Directorio Clientes + Solicitudes App PWA',
      cambioPropuesto: `${estadoAnterior || 'A VERIFICAR'} → PAGADO${ext.periodo ? ` (Período ${ext.periodo})` : ''}`,
      origen: `Validador Documental (${resultadoDoc.fileName || 'comprobante'})`,
      datosPayload: {
        cuit: cuitCli,
        periodo: ext.periodo || '',
        nuevoEstado: 'PAGADO',
        observacion: `Verificado desde ${resultadoDoc.fileName || 'documento'} (${ext.tipo_documento || 'Comprobante'}${ext.importe_total > 0 ? ` — ${formatARS(ext.importe_total)}` : ''})`
      }
    });
  };

  const handleCrearPropuestaPago = (e) => {
    e.preventDefault();
    setErrorNivel2('');
    const cuitLimpio = cleanCUIT(propCuit);
    if (cuitLimpio.length !== 11) {
      setErrorNivel2('Ingresá un CUIT válido de exactamente 11 dígitos para crear la propuesta.');
      return;
    }
    const esVep = propTipoPago === 'actualizar_estado_vep';
    agregarAccionABandejaNivel2({
      tipoAccion: propTipoPago,
      tituloAccion: esVep ? 'Actualizar Estado VEP' : 'Actualizar Estado de Honorarios',
      clienteNombre: propClienteNombre.trim() || `CUIT ${formatCUIT(cuitLimpio)}`,
      cuit: cuitLimpio,
      hojaDestino: esVep
        ? 'Directorio Clientes + Solicitudes App PWA'
        : 'Directorio Clientes + Control Honorarios',
      cambioPropuesto: `Estado → ${propNuevoEstado}${propPeriodo ? ` (Período ${propPeriodo})` : ''}`,
      origen: 'Generador rápido Nivel 2',
      datosPayload: {
        cuit: cuitLimpio,
        periodo: propPeriodo.trim(),
        nuevoEstado: propNuevoEstado,
        observacion: propObservacion.trim()
      }
    });
    setPropObservacion('');
  };

  const handleCrearPropuestaRegla = (e) => {
    e.preventDefault();
    setErrorNivel2('');
    if (!reglaTema.trim() || !reglaContenido.trim()) {
      setErrorNivel2('Completá el Tema y el Contenido de la regla antes de enviarla a la Bandeja.');
      return;
    }
    agregarAccionABandejaNivel2({
      tipoAccion: 'registrar_regla_normativa',
      tituloAccion: 'Registrar Nueva Regla Normativa',
      clienteNombre: reglaTema.trim(),
      cuit: '',
      hojaDestino: 'Base_Conocimiento_IA',
      cambioPropuesto: `Nueva fila VIGENTE [${reglaCategoria}] desde ${reglaVigenciaDesde || 'hoy'}`,
      origen: 'Generador rápido Nivel 2',
      datosPayload: {
        tema: reglaTema.trim(),
        categoria: reglaCategoria,
        contenidoRegla: reglaContenido.trim(),
        vigenciaDesde: reglaVigenciaDesde.trim(),
        fuenteNormativa: reglaFuente.trim() || 'Criterio técnico GR Servicios Contables'
      }
    });
    setReglaTema('');
    setReglaContenido('');
    setReglaFuente('');
  };

  const handleAprobarYEjecutarNivel2 = async (accion) => {
    if (!sesionAdmin?.sessionToken || ejecutandoAccionId) return;
    setErrorNivel2('');
    setAvisoNivel2('');
    setEjecutandoAccionId(accion.id);
    try {
      const res = await adminEjecutarAccionNivel2({
        sessionToken: sesionAdmin.sessionToken,
        tipoAccion: accion.tipoAccion,
        datos: accion.datosPayload
      });
      setAccionesNivel2((prev) => prev.filter((item) => item.id !== accion.id));
      setAvisoNivel2(res.resumen || 'Acción Nivel 2 ejecutada y auditada en Log_Cerebro_IA.');
      // Refrescar automáticamente el diagnóstico y el historial de Log_Cerebro_IA
      await ejecutarDiagnostico(sesionAdmin.sessionToken);
    } catch (err) {
      if (err?.sessionExpired || /sesi[oó]n\s+expirada/i.test(err?.message || '')) {
        forzarVueltaAlLogin('Sesión expirada. Ingresá nuevamente tu Clave Maestra de Administrador.');
        return;
      }
      setErrorNivel2(err?.message || 'No se pudo ejecutar la acción aprobada.');
    } finally {
      setEjecutandoAccionId('');
    }
  };

  const handleDescartarAccionNivel2 = (id) => {
    setAccionesNivel2((prev) => prev.filter((item) => item.id !== id));
    setAvisoNivel2('Propuesta descartada sin realizar ningún cambio en Google Sheets.');
  };

  const handleCopiarBorradorMensaje = async () => {
    try {
      await navigator.clipboard.writeText(borradorMensajeTexto);
      setMsgCopiado(true);
      setTimeout(() => setMsgCopiado(false), 2500);
    } catch {
      setErrorNivel2('No se pudo copiar automáticamente; seleccioná el texto manualmente.');
    }
  };

  useEffect(() => {
    if (mensajesChat.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [mensajesChat, enviandoChat]);

  const forzarVueltaAlLogin = useCallback((mensaje) => {
    eliminarStorageSeguro(ADMIN_SESSION_KEY);
    setSesionAdmin(null);
    setHealthData(null);
    setMensajesChat([]);
    setArchivoDoc(null);
    setResultadoDoc(null);
    setErrorDiagnostico('');
    setErrorChat('');
    setErrorDoc('');
    setError(mensaje || 'Tu sesión de administrador expiró. Ingresá nuevamente tu Clave Maestra.');
  }, []);

  const handleSeleccionarDocAdmin = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorDoc('');
    setResultadoDoc(null);

    const mimeRaw = String(file.type || '').toLowerCase();
    const esPdf = mimeRaw === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const esImagen = /^image\/(jpeg|jpg|png|webp)$/i.test(mimeRaw) || /\.(jpe?g|png|webp)$/i.test(file.name || '');

    if (!esPdf && !esImagen) {
      setErrorDoc('Formato no admitido. Seleccioná un PDF, JPG, PNG o WEBP.');
      return;
    }
    if (esPdf && file.size > 3.2 * 1024 * 1024) {
      setErrorDoc('El PDF supera los 3,2 MB admitidos por el analizador. Comprimilo o subí una captura.');
      return;
    }

    setPreparandoDoc(true);
    try {
      const proc = await prepararArchivoComprobante(file);
      setArchivoDoc({
        nombre: proc.nombre || file.name,
        mimeType: esPdf ? 'application/pdf' : proc.tipo || file.type || 'image/jpeg',
        base64: proc.base64,
        previewUrl: proc.previewUrl || '',
        esPdf,
        tamanoOriginal: proc.tamanoOriginal || file.size,
        tamanoFinal: proc.tamanoFinal || file.size,
        comprimido: Boolean(proc.comprimido)
      });
    } catch (err) {
      setErrorDoc(err?.message || 'No se pudo leer el archivo seleccionado.');
    } finally {
      setPreparandoDoc(false);
    }
  };

  const handleAnalizarYCruzarDocumento = async () => {
    if (!archivoDoc?.base64 || !sesionAdmin?.sessionToken || analizandoDoc) return;
    setErrorDoc('');
    setResultadoDoc(null);
    setAnalizandoDoc(true);
    try {
      const res = await adminAnalizarDocumento({
        fileBase64: archivoDoc.base64,
        mimeType: archivoDoc.mimeType,
        fileName: archivoDoc.nombre,
        sessionToken: sesionAdmin.sessionToken
      });
      setResultadoDoc(res);
    } catch (err) {
      if (err?.sessionExpired || /sesi[oó]n\s+expirada/i.test(err?.message || '')) {
        forzarVueltaAlLogin('Sesión expirada. Ingresá nuevamente tu Clave Maestra de Administrador.');
        return;
      }
      setErrorDoc(err?.message || 'No se pudo analizar y cruzar el documento.');
    } finally {
      setAnalizandoDoc(false);
    }
  };

  const enviarConsultaCerebro = useCallback(
    async (textoManual) => {
      const consulta = String(textoManual !== undefined ? textoManual : inputChat).trim();
      if (!consulta || enviandoChat || !sesionAdmin?.sessionToken) return;

      setErrorChat('');
      setInputChat('');

      const historialPrevio = mensajesChat.map((m) => ({
        role: m.role,
        text: m.text
      }));

      const nuevoMsgUsuario = {
        id: `usr-${Date.now()}`,
        role: 'user',
        text: consulta,
        hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      };

      setMensajesChat((prev) => [...prev, nuevoMsgUsuario]);
      setEnviandoChat(true);

      try {
        const res = await adminCerebroChat({
          message: consulta,
          sessionToken: sesionAdmin.sessionToken,
          history: historialPrevio
        });

        const nuevoMsgIA = {
          id: `ia-${Date.now()}`,
          role: 'model',
          text: res.reply || 'Sin respuesta del asistente.',
          toolsUsed: Array.isArray(res.toolsUsed) ? res.toolsUsed : [],
          model: res.model || 'gemini-3.8-flash',
          primaryModel: res.primaryModel || 'gemini-3.8-flash',
          usedFallback: Boolean(res.usedFallback),
          modelStatusMessage:
            res.modelStatusMessage ||
            (res.usedFallback
              ? `Respondido por modelo de respaldo (${res.model || 'alternativo'})`
              : `Respondido por modelo principal (${res.model || 'gemini-3.8-flash'})`),
          hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        };
        setMensajesChat((prev) => [...prev, nuevoMsgIA]);
      } catch (err) {
        if (err?.sessionExpired || /sesi[oó]n\s+expirada/i.test(err?.message || '')) {
          forzarVueltaAlLogin('Sesión expirada. Ingresá nuevamente tu Clave Maestra de Administrador.');
          return;
        }
        setErrorChat(err?.message || 'No se pudo obtener respuesta de GR Cerebro de IA.');
      } finally {
        setEnviandoChat(false);
      }
    },
    [inputChat, enviandoChat, sesionAdmin?.sessionToken, mensajesChat, forzarVueltaAlLogin]
  );

  const ejecutarDiagnostico = useCallback(
    async (token) => {
      if (!token) return;
      setCargandoDiagnostico(true);
      setErrorDiagnostico('');
      try {
        const res = await adminHealthcheck({ sessionToken: token });
        setHealthData(res);
      } catch (err) {
        if (err?.sessionExpired || /sesi[oó]n\s+expirada/i.test(err?.message || '')) {
          forzarVueltaAlLogin('Sesión expirada. Ingresá nuevamente tu Clave Maestra de Administrador.');
          return;
        }
        setErrorDiagnostico(err?.message || 'No se pudo actualizar el diagnóstico técnico.');
      } finally {
        setCargandoDiagnostico(false);
      }
    },
    [forzarVueltaAlLogin]
  );

  // Verificar sesión temporal del administrador (CacheService 2 h) al abrir /admin
  useEffect(() => {
    let cancelado = false;
    const verificar = async () => {
      const guardada = leerJsonSeguro(ADMIN_SESSION_KEY, null);
      if (!guardada?.sessionToken) {
        if (!cancelado) setVerificandoSesion(false);
        return;
      }

      try {
        const res = await adminVerifySession({ sessionToken: guardada.sessionToken });
        if (!cancelado && res?.ok && res?.valid) {
          setSesionAdmin({
            sessionToken: guardada.sessionToken,
            role: res.role || 'admin',
            adminName: res.adminName || guardada.adminName || 'Administrador',
            createdAt: res.createdAt || guardada.createdAt || '',
            createdAtAR: res.createdAtAR || guardada.createdAtAR || '',
            expiresAt: res.expiresAt || guardada.expiresAt || '',
            auditSheet: res.auditSheet || 'Log_Cerebro_IA'
          });
        } else {
          eliminarStorageSeguro(ADMIN_SESSION_KEY);
          if (!cancelado) setSesionAdmin(null);
        }
      } catch {
        eliminarStorageSeguro(ADMIN_SESSION_KEY);
        if (!cancelado) setSesionAdmin(null);
      } finally {
        if (!cancelado) setVerificandoSesion(false);
      }
    };

    verificar();
    return () => {
      cancelado = true;
    };
  }, []);

  // Apenas queda autenticado el administrador, disparar admin_healthcheck automáticamente
  useEffect(() => {
    if (sesionAdmin?.sessionToken) {
      ejecutarDiagnostico(sesionAdmin.sessionToken);
    }
  }, [sesionAdmin?.sessionToken, ejecutarDiagnostico]);

  const handleLoginAdmin = async (e) => {
    e.preventDefault();
    if (autenticando) return;
    setError('');

    const claveLimpia = masterKey.trim();
    if (!claveLimpia) {
      setError('Ingresá tu Clave Maestra de Administrador.');
      return;
    }

    setAutenticando(true);
    try {
      const res = await adminLogin({ masterKey: claveLimpia });
      const nuevaSesion = {
        sessionToken: res.sessionToken,
        role: res.role || 'admin',
        adminName: res.adminName || 'Alfredo Germán Read',
        createdAt: res.createdAt || new Date().toISOString(),
        createdAtAR:
          res.createdAtAR ||
          new Date().toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
        expiresAt: res.expiresAt || '',
        auditSheet: res.auditSheet || 'Log_Cerebro_IA'
      };
      guardarJsonSeguro(ADMIN_SESSION_KEY, nuevaSesion);
      setSesionAdmin(nuevaSesion);
      setMasterKey('');
    } catch (err) {
      setError(err?.message || 'Credenciales inválidas');
    } finally {
      setAutenticando(false);
    }
  };

  const handleCerrarSesionAdmin = async () => {
    if (cerrandoSesion) return;
    setCerrandoSesion(true);
    try {
      if (sesionAdmin?.sessionToken) {
        await adminLogout({ sessionToken: sesionAdmin.sessionToken });
      }
    } finally {
      eliminarStorageSeguro(ADMIN_SESSION_KEY);
      setSesionAdmin(null);
      setHealthData(null);
      setMasterKey('');
      setError('');
      setErrorDiagnostico('');
      setCerrandoSesion(false);
    }
  };

  const toggleExpandirPlanilla = (id) => {
    setPlanillasExpandidas((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (verificandoSesion) {
    return (
      <div className="min-h-screen bg-[#0F4C5C]">
        <LoadingOverlay visible={true} message="Verificando sesión de Administrador..." />
      </div>
    );
  }

  // PANTALLA DE ACCESO EXCLUSIVO (/admin)
  if (!sesionAdmin) {
    return (
      <div className="min-h-screen bg-[#0F4C5C] flex flex-col justify-between p-4 sm:p-6">
        <LoadingOverlay visible={autenticando} message="Validando Clave Maestra..." />

        <div className="flex-1 flex items-center justify-center">
          <section className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-2 border-[#FBF8CC]/40 overflow-hidden">
            <div className="bg-[#0F4C5C] text-white border-b-4 border-[#E36414] px-6 py-7 text-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-white p-1.5 mx-auto shadow-lg ring-4 ring-[#FBF8CC]/30 flex items-center justify-center overflow-hidden">
                <img
                  src="/logo-gr.png"
                  alt="GR Servicios Contables"
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-white/15 text-[#FBF8CC]">
                  <Lock className="w-3 h-3" />
                  <span>Acceso Restringido — Nivel 1</span>
                </span>
                <h1 className="text-lg sm:text-xl font-black tracking-tight leading-snug pt-1">
                  GR ESTUDIO – CENTRO DE INTELIGENCIA Y CONTROL
                </h1>
                <p className="text-xs text-petroleo-100">
                  Módulo exclusivo de administración • Auditoría activa en Log_Cerebro_IA
                </p>
              </div>
            </div>

            <form onSubmit={handleLoginAdmin} className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="admin-master-key"
                  className="block text-xs font-extrabold uppercase tracking-wide text-[#0F4C5C] mb-1.5"
                >
                  Clave Maestra de Administrador
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-master-key"
                    type={mostrarClave ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={masterKey}
                    onChange={(e) => {
                      setMasterKey(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Ingresá tu ADMIN_MASTER_KEY"
                    className="w-full pl-10 pr-11 py-3.5 rounded-2xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-sm font-bold text-slate-900 focus:outline-none focus:border-[#0F4C5C] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarClave((v) => !v)}
                    aria-label={mostrarClave ? 'Ocultar clave' : 'Mostrar clave'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-slate-400 hover:text-[#0F4C5C] transition"
                  >
                    {mostrarClave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={autenticando || !masterKey.trim()}
                className="w-full bg-[#E36414] hover:bg-ladrillo-dark disabled:opacity-50 text-white font-extrabold text-sm py-3.5 rounded-2xl shadow-md transition active:scale-[0.99]"
              >
                {autenticando ? 'Validando acceso...' : 'Ingresar al Centro de Control'}
              </button>

              <p className="text-[11px] text-center text-slate-500 leading-snug pt-1">
                Cada intento de acceso queda registrado automáticamente en la hoja{' '}
                <strong className="text-[#0F4C5C]">Log_Cerebro_IA</strong> sin almacenar claves ni tokens.
              </p>
            </form>
          </section>
        </div>

        <footer className="text-center text-[11px] text-[#FBF8CC]/80 pt-4">
          GR Servicios Contables • Cerebro Central de IA (Etapa 2 — Supervisión Solo Lectura)
        </footer>
      </div>
    );
  }

  const componentesLista = healthData?.componentes
    ? [
        healthData.componentes.portalPwa,
        healthData.componentes.bot1,
        healthData.componentes.bot2,
        healthData.componentes.puenteArca
      ].filter(Boolean)
    : [
        { id: 'portal', nombre: 'Portal de Autogestión (PWA)', status: '', detalle: 'Consultando estado...' },
        { id: 'bot1', nombre: 'Bot 1 — Registro de Comprobantes', status: '', detalle: 'Consultando estado...' },
        { id: 'bot2', nombre: 'Bot 2 — Ganancias Autónomo', status: '', detalle: 'Consultando estado...' },
        { id: 'arca', nombre: 'Puente ARCA', status: '', detalle: 'Consultando estado...' }
      ];

  const planillasLista =
    Array.isArray(healthData?.planillas) && healthData.planillas.length > 0
      ? healthData.planillas
      : PLANILLAS_FALLBACK.map((p) => ({
          ...p,
          configured: false,
          status: '',
          sheetCount: 0,
          sheetNames: [],
          error: ''
        }));

  const logsLista = Array.isArray(healthData?.logs) ? healthData.logs : [];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <LoadingOverlay
        visible={
          cerrandoSesion ||
          Boolean(ejecutandoAccionId) ||
          analizandoDoc ||
          preparandoDoc ||
          (cargandoDiagnostico && !healthData)
        }
        message={
          cerrandoSesion
            ? 'Cerrando sesión Admin...'
            : ejecutandoAccionId
              ? 'Ejecutando acción Nivel 2 autorizada...'
              : preparandoDoc
                ? 'Optimizando archivo para análisis...'
                : analizandoDoc
                  ? 'Analizando documento y cruzando con planillas...'
                  : 'Ejecutando diagnóstico solo lectura...'
        }
      />

      {/* Encabezado Administrador */}
      <header className="sticky top-0 z-30 bg-[#0F4C5C] text-white border-b-4 border-[#E36414] shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-white p-1 flex items-center justify-center shadow-sm ring-2 ring-[#FBF8CC]/40 shrink-0 overflow-hidden">
              <img
                src="/logo-gr.png"
                alt="GR Servicios Contables"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-black tracking-tight leading-tight">
                  GR ESTUDIO – CENTRO DE INTELIGENCIA Y CONTROL
                </h1>
                <span className="text-[10px] font-black uppercase bg-[#FBF8CC] text-[#0F4C5C] px-2 py-0.5 rounded-full">
                  Admin
                </span>
              </div>
              <p className="text-xs text-petroleo-100 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <ShieldCheck className="w-3.5 h-3.5 text-[#FBF8CC] shrink-0" />
                <span>{sesionAdmin.adminName}</span>
                <span className="opacity-60">•</span>
                <span className="opacity-90">Nivel 1 (Solo Lectura)</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => ejecutarDiagnostico(sesionAdmin.sessionToken)}
              disabled={cargandoDiagnostico || cerrandoSesion}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-[#E36414] hover:bg-ladrillo-dark disabled:opacity-60 text-white px-3.5 py-2.5 rounded-xl shadow-sm transition active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${cargandoDiagnostico ? 'animate-spin' : ''}`} />
              <span>{cargandoDiagnostico ? 'Actualizando...' : 'Actualizar Diagnóstico'}</span>
            </button>

            <button
              type="button"
              onClick={handleCerrarSesionAdmin}
              disabled={cerrandoSesion}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-white/15 hover:bg-white/25 disabled:opacity-50 text-white px-3.5 py-2.5 rounded-xl border border-white/20 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión Admin</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Banner de Estado Etapa 3 */}
        <section className="bg-[#FBF8CC] border border-amber-300/80 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0F4C5C] text-[#FBF8CC] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#E36414] block">
                Etapa 5 — Nivel 1 (Consulta/OCR) + Nivel 2 (Aprobación Humana Obligatoria)
              </span>
              <h2 className="text-sm sm:text-base font-black text-[#0F4C5C] leading-snug">
                Chat Central, Validador Documental, Bandeja Nivel 2 y Supervisión ERP
              </h2>
              <p className="text-xs text-slate-700 mt-0.5">
                {healthData?.checkedAtAR
                  ? `Última verificación técnica: ${healthData.checkedAtAR} • Estricto Nivel 1 (Solo Lectura auditado en Log_Cerebro_IA).`
                  : 'Consultando estado de conectores en estricto modo solo lectura...'}
              </p>
            </div>
          </div>

          {healthData?.resumen && (
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-full">
                {healthData.resumen.planillasOk}/{healthData.resumen.totalPlanillas} OK
              </span>
              {healthData.resumen.planillasSinId > 0 && (
                <span className="text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-full">
                  {healthData.resumen.planillasSinId} Sin ID
                </span>
              )}
              {healthData.resumen.planillasError > 0 && (
                <span className="text-[11px] font-extrabold bg-red-100 text-red-900 border border-red-200 px-2.5 py-1 rounded-full">
                  {healthData.resumen.planillasError} Error
                </span>
              )}
            </div>
          )}
        </section>

        {/* 0. CHAT CENTRAL — GR CEREBRO DE IA (MÓDULOS 1 Y 3 — NIVEL 1 SOLO LECTURA) */}
        <section className="bg-white rounded-3xl shadow-sm border-2 border-[#0F4C5C]/20 overflow-hidden">
          <div className="bg-[#0F4C5C] text-white px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-white/15 border border-[#FBF8CC]/30 text-[#FBF8CC] flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black leading-tight">
                  Chat Central — GR Cerebro de IA
                </h3>
                <p className="text-[11px] text-petroleo-100">
                  Gemini 3.8 Flash • 5 herramientas Nivel 1 (Clientes, VEPs, Honorarios, Vencimientos/Alertas y Normativa)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#FBF8CC] text-[#0F4C5C] px-2.5 py-1 rounded-full">
                Solo Lectura
              </span>
              {mensajesChat.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMensajesChat([]);
                    setErrorChat('');
                  }}
                  disabled={enviandoChat}
                  title="Limpiar conversación"
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* 3 botones de consulta rápida */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                Consultas rápidas de ejemplo
              </span>
              <div className="flex flex-wrap gap-2">
                {CONSULTAS_RAPIDAS_CEREBRO.map((pregunta) => (
                  <button
                    key={pregunta}
                    type="button"
                    disabled={enviandoChat}
                    onClick={() => enviarConsultaCerebro(pregunta)}
                    className="text-left text-xs font-bold bg-[#F8FAFC] hover:bg-petroleo-50 text-[#0F4C5C] border border-slate-200 hover:border-[#0F4C5C]/40 disabled:opacity-50 px-3 py-2 rounded-2xl transition active:scale-[0.99]"
                  >
                    {pregunta}
                  </button>
                ))}
              </div>
            </div>

            {/* Historial de mensajes */}
            <div className="rounded-2xl bg-[#F8FAFC] border border-slate-200/80 p-3.5 sm:p-4 max-h-[420px] overflow-y-auto space-y-3.5">
              {mensajesChat.length === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <Sparkles className="w-7 h-7 text-[#E36414] mx-auto" />
                  <p className="text-xs sm:text-sm font-black text-[#0F4C5C]">
                    Listo para consultar las planillas reales del estudio
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Probá cualquiera de los accesos rápidos de arriba o preguntá por un cliente (CUIT o nombre), VEPs, honorarios, vencimientos o alertas de ARCA. Cada consulta queda auditada en <strong className="font-mono text-[#0F4C5C]">Log_Cerebro_IA</strong>.
                  </p>
                </div>
              ) : (
                mensajesChat.map((msg) => {
                  const esUsuario = msg.role === 'user';
                  const tools = Array.isArray(msg.toolsUsed) ? msg.toolsUsed : [];
                  const fuentesUnicas = Array.from(
                    new Set(tools.flatMap((t) => (Array.isArray(t.fuentes) ? t.fuentes : [])))
                  );

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${esUsuario ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-[13px] shadow-sm space-y-2 ${
                          esUsuario
                            ? 'bg-[#0F4C5C] text-white rounded-br-md'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
                        }`}
                      >
                        {/* Badges de herramientas consultadas en este turno */}
                        {!esUsuario && tools.length > 0 && (
                          <div className="pb-2 border-b border-slate-100 space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                <Wrench className="w-3 h-3 text-[#E36414]" />
                                <span>Herramientas consultadas:</span>
                              </span>
                              {tools.map((t, tIdx) => (
                                <span
                                  key={`${t.name}-${tIdx}`}
                                  className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                    t.ok
                                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                      : 'bg-amber-50 text-amber-900 border-amber-200'
                                  }`}
                                >
                                  <span>{ETIQUETAS_HERRAMIENTAS[t.name] || t.name}</span>
                                </span>
                              ))}
                            </div>
                            {fuentesUnicas.length > 0 && (
                              <p className="text-[10px] text-slate-500 leading-snug">
                                <strong>Fuentes:</strong> {fuentesUnicas.join(' • ')}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="space-y-1">
                          {esUsuario ? (
                            <p className="font-semibold leading-relaxed whitespace-pre-wrap">
                              {msg.text}
                            </p>
                          ) : (
                            renderTextoFormateadoIA(msg.text)
                          )}
                        </div>

                        <div
                          className={`pt-1.5 flex items-center justify-between gap-2 flex-wrap text-[10px] ${
                            esUsuario
                              ? 'justify-end text-petroleo-100/80'
                              : 'border-t border-slate-100 text-slate-500'
                          }`}
                        >
                          {!esUsuario && (
                            <span
                              className={`inline-flex items-center gap-1 font-extrabold px-2 py-0.5 rounded-full border ${
                                msg.usedFallback
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-petroleo-50 text-[#0F4C5C] border-petroleo/15'
                              }`}
                            >
                              <span>
                                {msg.modelStatusMessage ||
                                  (msg.usedFallback
                                    ? `Modelo de respaldo (${msg.model})`
                                    : `Modelo principal (${msg.model || 'gemini-3.8-flash'})`)}
                              </span>
                            </span>
                          )}
                          <span className="ml-auto">{msg.hora}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {enviandoChat && (
                <div className="flex items-start">
                  <div className="bg-white border border-[#0F4C5C]/20 rounded-2xl rounded-bl-md px-4 py-3 text-xs font-bold text-[#0F4C5C] flex items-center gap-2 shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-[#E36414] shrink-0" />
                    <span>GR Cerebro consultando planillas en Nivel 1...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {errorChat && (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorChat}</span>
              </div>
            )}

            {/* Barra de entrada del Chat */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviarConsultaCerebro();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputChat}
                onChange={(e) => {
                  setInputChat(e.target.value);
                  if (errorChat) setErrorChat('');
                }}
                disabled={enviandoChat}
                placeholder="Consultá por un cliente (CUIT o nombre), VEPs, honorarios, alertas o vencimientos..."
                className="flex-1 px-4 py-3 rounded-2xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F4C5C] transition"
              />
              <button
                type="submit"
                disabled={enviandoChat || !inputChat.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-3 rounded-2xl bg-[#E36414] hover:bg-ladrillo-dark disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm shadow-sm transition active:scale-95 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Consultar</span>
              </button>
            </form>
          </div>
        </section>

        {/* 0B. VALIDADOR DOCUMENTAL (PDF / IMAGEN) — NIVEL 1 (ETAPA 4) */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="bg-[#F8FAFC] border-b border-slate-200/80 px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#0F4C5C] text-[#FBF8CC] flex items-center justify-center shrink-0">
                <FileSearch className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black text-[#0F4C5C] leading-tight">
                  Validador Documental (PDF / Imagen) — Nivel 1
                </h3>
                <p className="text-xs text-slate-500">
                  Extraé datos con OCR/IA y cruzá automáticamente contra Directorio, Solicitudes y Honorarios (sin editar celdas)
                </p>
              </div>
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider bg-petroleo-50 text-[#0F4C5C] border border-petroleo/20 px-2.5 py-1 rounded-full">
              Solo Lectura
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            <input
              ref={inputDocAdminRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleSeleccionarDocAdmin}
              className="hidden"
            />

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                disabled={preparandoDoc || analizandoDoc}
                onClick={() => inputDocAdminRef.current?.click()}
                className="flex-1 py-3.5 px-4 rounded-2xl border-2 border-dashed border-[#0F4C5C]/35 bg-[#F8FAFC] hover:bg-petroleo-50/50 disabled:opacity-50 text-[#0F4C5C] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
              >
                <UploadCloud className="w-5 h-5 text-[#E36414] shrink-0" />
                <span>
                  {archivoDoc ? `Cambiar archivo (${archivoDoc.nombre})` : 'Seleccionar PDF, JPG o PNG'}
                </span>
              </button>

              <button
                type="button"
                disabled={!archivoDoc || preparandoDoc || analizandoDoc}
                onClick={handleAnalizarYCruzarDocumento}
                className="py-3.5 px-5 rounded-2xl bg-[#E36414] hover:bg-ladrillo-dark disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-95 shrink-0"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  {analizandoDoc ? 'Analizando y cruzando...' : 'Analizar y Cruzar con Planillas'}
                </span>
              </button>
            </div>

            {/* Vista previa compacta del archivo seleccionado */}
            {archivoDoc && (
              <div className="rounded-2xl bg-[#F8FAFC] border border-slate-200 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {archivoDoc.esPdf || !archivoDoc.previewUrl ? (
                    <div className="w-11 h-11 rounded-xl bg-[#0F4C5C] text-[#FBF8CC] flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  ) : (
                    <img
                      src={archivoDoc.previewUrl}
                      alt="Vista previa del documento"
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800 truncate">{archivoDoc.nombre}</p>
                    <p className="text-[11px] text-slate-500">
                      {archivoDoc.esPdf ? 'Documento PDF' : 'Imagen'} •{' '}
                      {archivoDoc.comprimido
                        ? `${formatBytes(archivoDoc.tamanoOriginal)} → ${formatBytes(archivoDoc.tamanoFinal)}`
                        : formatBytes(archivoDoc.tamanoFinal)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setArchivoDoc(null);
                    setResultadoDoc(null);
                    setErrorDoc('');
                    if (inputDocAdminRef.current) inputDocAdminRef.current.value = '';
                  }}
                  aria-label="Quitar archivo"
                  className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {errorDoc && (
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorDoc}</span>
              </div>
            )}

            {/* Resultado estructurado: Datos extraídos + Cruce contra Google Sheets */}
            {resultadoDoc?.datosExtraidos && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                {/* Columna A: Datos extraídos por OCR/IA */}
                <div className="rounded-2xl bg-[#F8FAFC] border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#0F4C5C]">
                      1. Datos extraídos del documento
                    </h4>
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      {resultadoDoc.model || 'gemini-3.8-flash'}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Tipo</dt>
                      <dd className="font-black text-slate-900 mt-0.5">
                        {resultadoDoc.datosExtraidos.tipo_documento || 'S/D'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Importe Total</dt>
                      <dd className="font-black text-[#0F4C5C] mt-0.5">
                        {resultadoDoc.datosExtraidos.importe_total > 0
                          ? formatARS(resultadoDoc.datosExtraidos.importe_total)
                          : 'No detectado'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">CUIT</dt>
                      <dd className="font-mono font-bold text-slate-800 mt-0.5">
                        {resultadoDoc.datosExtraidos.cuit
                          ? formatCUIT(resultadoDoc.datosExtraidos.cuit)
                          : 'No detectado'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Período / Fecha</dt>
                      <dd className="font-bold text-slate-800 mt-0.5">
                        {[resultadoDoc.datosExtraidos.periodo, resultadoDoc.datosExtraidos.fecha]
                          .filter(Boolean)
                          .join(' • ') || 'S/D'}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[10px] font-bold uppercase text-slate-400">
                        Nombre / Razón Social
                      </dt>
                      <dd className="font-bold text-slate-800 mt-0.5">
                        {resultadoDoc.datosExtraidos.nombre_razon_social || 'No detectado'}
                      </dd>
                    </div>
                    {resultadoDoc.datosExtraidos.numero_comprobante_cae && (
                      <div className="col-span-2">
                        <dt className="text-[10px] font-bold uppercase text-slate-400">
                          N° Comprobante / VEP / CAE
                        </dt>
                        <dd className="font-mono font-bold text-slate-800 mt-0.5">
                          {resultadoDoc.datosExtraidos.numero_comprobante_cae}
                        </dd>
                      </div>
                    )}
                    {resultadoDoc.datosExtraidos.observaciones && (
                      <div className="col-span-2">
                        <dt className="text-[10px] font-bold uppercase text-slate-400">Observaciones IA</dt>
                        <dd className="text-slate-600 mt-0.5 leading-snug">
                          {resultadoDoc.datosExtraidos.observaciones}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Columna B: Resultado del cruce contra las planillas en Google Sheets */}
                <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 flex-wrap">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#0F4C5C]">
                      2. Cruce contra Planillas del Estudio
                    </h4>
                    {resultadoDoc.crucePlanillas?.estadoCruce && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          resultadoDoc.crucePlanillas.estadoCruce === 'COINCIDENCIA_OK'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                            : resultadoDoc.crucePlanillas.estadoCruce === 'CON_DISCREPANCIAS'
                              ? 'bg-amber-100 text-amber-900 border-amber-200'
                              : 'bg-red-100 text-red-900 border-red-200'
                        }`}
                      >
                        {resultadoDoc.crucePlanillas.estadoCruce === 'COINCIDENCIA_OK'
                          ? 'Coincidencia OK'
                          : resultadoDoc.crucePlanillas.estadoCruce === 'CON_DISCREPANCIAS'
                            ? 'Con discrepancias'
                            : 'Cliente no encontrado'}
                      </span>
                    )}
                  </div>

                  {resultadoDoc.avisoCruce && (
                    <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      {resultadoDoc.avisoCruce}
                    </p>
                  )}

                  {resultadoDoc.crucePlanillas && (
                    <div className="space-y-3 text-xs">
                      {resultadoDoc.crucePlanillas.resumenCruce && (
                        <p className="font-bold text-slate-800 leading-snug">
                          {resultadoDoc.crucePlanillas.resumenCruce}
                        </p>
                      )}

                      {resultadoDoc.crucePlanillas.clienteEncontrado && (
                        <div className="rounded-xl bg-[#F8FAFC] border border-slate-200 p-3 space-y-1 text-[11px]">
                          <p className="font-black text-[#0F4C5C]">
                            {resultadoDoc.crucePlanillas.clienteEncontrado.cliente} (Cat.{' '}
                            {resultadoDoc.crucePlanillas.clienteEncontrado.categoria})
                          </p>
                          <p className="text-slate-600">
                            Cuota VEP:{' '}
                            <strong>
                              {formatARS(resultadoDoc.crucePlanillas.clienteEncontrado.cuotaMonotributo)}
                            </strong>{' '}
                            ({resultadoDoc.crucePlanillas.clienteEncontrado.estadoMesActualVep}) •
                            Honorarios:{' '}
                            <strong>
                              {formatARS(resultadoDoc.crucePlanillas.clienteEncontrado.importeHonorarios)}
                            </strong>{' '}
                            ({resultadoDoc.crucePlanillas.clienteEncontrado.estadoHonorarios})
                          </p>
                        </div>
                      )}

                      {Array.isArray(resultadoDoc.crucePlanillas.hallazgos) &&
                        resultadoDoc.crucePlanillas.hallazgos.length > 0 && (
                          <div className="space-y-2">
                            {resultadoDoc.crucePlanillas.hallazgos.map((h, hIdx) => {
                              const cls =
                                h.nivel === 'ok'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                  : h.nivel === 'alerta'
                                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                                    : 'bg-red-50 border-red-200 text-red-950';
                              return (
                                <div key={hIdx} className={`rounded-xl border p-2.5 space-y-0.5 ${cls}`}>
                                  <p className="font-black text-[11px]">{h.titulo}</p>
                                  <p className="text-[11px] leading-snug opacity-90">{h.detalle}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}

                      {resultadoDoc.crucePlanillas.clienteEncontrado && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={handleEnviarDocABandejaNivel2}
                            className="w-full py-3 px-4 rounded-2xl bg-[#0F4C5C] hover:bg-petroleo-dark text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.99]"
                          >
                            <PlusCircle className="w-4 h-4 text-[#FBF8CC] shrink-0" />
                            <span>
                              + Enviar a Bandeja de Aprobación (Marcar como Pagado/Verificado)
                            </span>
                          </button>
                        </div>
                      )}

                      {Array.isArray(resultadoDoc.crucePlanillas.fuentesConsultadas) && (
                        <p className="text-[10px] text-slate-400 pt-1">
                          Fuentes verificadas (solo lectura):{' '}
                          {resultadoDoc.crucePlanillas.fuentesConsultadas.join(' • ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 0C. BANDEJA DE ACCIONES SUGERIDAS — NIVEL 2 (REQUIERE TU APROBACIÓN) */}
        <section
          ref={bandejaNivel2Ref}
          className="bg-white rounded-3xl shadow-sm border-2 border-[#E36414]/35 overflow-hidden scroll-mt-24"
        >
          <div className="bg-[#0F4C5C] text-white px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#E36414] text-white flex items-center justify-center shrink-0 shadow-sm">
                <Inbox className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black leading-tight">
                  Bandeja de Acciones Sugeridas — Nivel 2 (Requiere tu aprobación)
                </h3>
                <p className="text-[11px] text-petroleo-100">
                  Ninguna escritura se ejecuta sola: revisá el cambio propuesto y aprobá en 1 clic con auditoría en Log_Cerebro_IA
                </p>
              </div>
            </div>
            <span className="text-[11px] font-black bg-[#FBF8CC] text-[#0F4C5C] px-3 py-1 rounded-full shrink-0">
              {accionesNivel2.length} {accionesNivel2.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
            {avisoNivel2 && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{avisoNivel2}</span>
              </div>
            )}

            {errorNivel2 && (
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorNivel2}</span>
              </div>
            )}

            {/* Lista de tarjetas pendientes de aprobación humana */}
            {accionesNivel2.length === 0 ? (
              <div className="p-5 rounded-2xl bg-[#F8FAFC] border border-dashed border-slate-300 text-center space-y-1.5">
                <ShieldCheck className="w-7 h-7 text-[#0F4C5C]/50 mx-auto" />
                <p className="text-xs font-black text-slate-700">
                  No hay acciones pendientes de aprobación
                </p>
                <p className="text-[11px] text-slate-500">
                  Podés enviar una propuesta desde el Validador Documental o usar el generador rápido de abajo.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {accionesNivel2.map((accion) => {
                  const ejecutandoEsta = ejecutandoAccionId === accion.id;
                  return (
                    <article
                      key={accion.id}
                      className="rounded-2xl bg-[#FBF8CC]/45 border-2 border-amber-300/80 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="space-y-0.5 min-w-0">
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#E36414]">
                            <span>Nivel 2 — Pendiente de aprobación</span>
                            {accion.origen && <span className="text-slate-500">• {accion.origen}</span>}
                          </span>
                          <h4 className="text-sm font-black text-[#0F4C5C] leading-snug">
                            {accion.tituloAccion}
                          </h4>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-500">
                          {accion.creadoEn}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white rounded-xl p-3 border border-amber-200/80 text-xs">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                            {accion.tipoAccion === 'registrar_regla_normativa' ? 'Tema' : 'Cliente / CUIT'}
                          </span>
                          <p className="font-black text-slate-900 mt-0.5 leading-snug">
                            {accion.clienteNombre}
                          </p>
                          {accion.cuit && (
                            <p className="text-[11px] font-mono text-slate-500">
                              CUIT {formatCUIT(accion.cuit)}
                            </p>
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                            Hoja destino
                          </span>
                          <p className="font-bold text-[#0F4C5C] mt-0.5 leading-snug">
                            {accion.hojaDestino}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                            Cambio propuesto
                          </span>
                          <p className="font-extrabold text-emerald-800 mt-0.5 leading-snug">
                            {accion.cambioPropuesto}
                          </p>
                        </div>
                      </div>

                      {accion.datosPayload?.contenidoRegla && (
                        <p className="text-xs text-slate-700 bg-white rounded-xl p-3 border border-slate-200 leading-snug">
                          <strong>Regla:</strong> {accion.datosPayload.contenidoRegla}
                        </p>
                      )}
                      {accion.datosPayload?.observacion && (
                        <p className="text-[11px] text-slate-600 leading-snug">
                          <strong>Observación:</strong> {accion.datosPayload.observacion}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                          type="button"
                          disabled={Boolean(ejecutandoAccionId)}
                          onClick={() => handleAprobarYEjecutarNivel2(accion)}
                          className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                        >
                          <Check className="w-4 h-4 shrink-0" />
                          <span>{ejecutandoEsta ? 'Ejecutando...' : 'Aprobar y Ejecutar'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(ejecutandoAccionId)}
                          onClick={() => handleDescartarAccionNivel2(accion.id)}
                          className="py-3 px-4 rounded-xl bg-white hover:bg-red-50 disabled:opacity-50 text-red-700 border border-red-200 font-extrabold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <X className="w-4 h-4 shrink-0" />
                          <span>Descartar</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Generador rápido Nivel 2 (3 pestañas) */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#0F4C5C]">
                  Generador rápido de propuestas Nivel 2
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setTabGeneradorN2('estado_pago')}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition ${
                      tabGeneradorN2 === 'estado_pago'
                        ? 'bg-[#0F4C5C] text-white border-[#0F4C5C]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#0F4C5C]/40'
                    }`}
                  >
                    1. VEP / Honorario
                  </button>
                  <button
                    type="button"
                    onClick={() => setTabGeneradorN2('normativa')}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition ${
                      tabGeneradorN2 === 'normativa'
                        ? 'bg-[#0F4C5C] text-white border-[#0F4C5C]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#0F4C5C]/40'
                    }`}
                  >
                    2. Regla Normativa
                  </button>
                  <button
                    type="button"
                    onClick={() => setTabGeneradorN2('borrador_msg')}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition ${
                      tabGeneradorN2 === 'borrador_msg'
                        ? 'bg-[#E36414] text-white border-[#E36414]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#E36414]/40'
                    }`}
                  >
                    3. Borrador WhatsApp / Telegram
                  </button>
                </div>
              </div>

              {/* Generador 1: Actualizar Estado VEP o Honorario */}
              {tabGeneradorN2 === 'estado_pago' && (
                <form
                  onSubmit={handleCrearPropuestaPago}
                  className="rounded-2xl bg-[#F8FAFC] border border-slate-200 p-4 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Acción
                      </label>
                      <select
                        value={propTipoPago}
                        onChange={(e) => setPropTipoPago(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#0F4C5C] focus:outline-none focus:border-[#0F4C5C]"
                      >
                        <option value="actualizar_estado_vep">Actualizar Estado VEP</option>
                        <option value="actualizar_estado_honorario">Actualizar Estado Honorario</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        CUIT del cliente (11 dígitos) *
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={propCuit}
                        onChange={(e) => setPropCuit(formatCUIT(e.target.value))}
                        placeholder="20-34567890-4"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Período (opcional)
                      </label>
                      <input
                        type="text"
                        value={propPeriodo}
                        onChange={(e) => setPropPeriodo(e.target.value)}
                        placeholder="2026-11"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Nuevo Estado
                      </label>
                      <select
                        value={propNuevoEstado}
                        onChange={(e) => setPropNuevoEstado(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#0F4C5C] focus:outline-none focus:border-[#0F4C5C]"
                      >
                        <option value="PAGADO">PAGADO</option>
                        <option value="A VERIFICAR">A VERIFICAR</option>
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="ENVIADO">ENVIADO</option>
                        <option value="VENCIDO">VENCIDO</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Nombre cliente (referencia visual)
                      </label>
                      <input
                        type="text"
                        value={propClienteNombre}
                        onChange={(e) => setPropClienteNombre(e.target.value)}
                        placeholder="Ej: Pérez Juan Carlos"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Observación de auditoría
                      </label>
                      <input
                        type="text"
                        value={propObservacion}
                        onChange={(e) => setPropObservacion(e.target.value)}
                        placeholder="Ej: Comprobante PagoMisCuentas verificado"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0F4C5C] hover:bg-petroleo-dark text-white font-extrabold text-xs shadow-sm transition"
                  >
                    <PlusCircle className="w-4 h-4 text-[#FBF8CC]" />
                    <span>Proponer en Bandeja Nivel 2 (sin escribir todavía)</span>
                  </button>
                </form>
              )}

              {/* Generador 2: Proponer Nueva Regla Normativa */}
              {tabGeneradorN2 === 'normativa' && (
                <form
                  onSubmit={handleCrearPropuestaRegla}
                  className="rounded-2xl bg-[#F8FAFC] border border-slate-200 p-4 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Tema de la regla *
                      </label>
                      <input
                        type="text"
                        required
                        value={reglaTema}
                        onChange={(e) => setReglaTema(e.target.value)}
                        placeholder="Ej: Recategorización Semestral ARCA — Plazos y topes"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Categoría
                      </label>
                      <select
                        value={reglaCategoria}
                        onChange={(e) => setReglaCategoria(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#0F4C5C] focus:outline-none focus:border-[#0F4C5C]"
                      >
                        <option value="Monotributo">Monotributo</option>
                        <option value="VEP / Pagos">VEP / Pagos</option>
                        <option value="Ingresos Brutos / CM">Ingresos Brutos / CM</option>
                        <option value="Ganancias">Ganancias</option>
                        <option value="Facturación ARCA">Facturación ARCA</option>
                        <option value="General">General</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                      Contenido de la regla / criterio vigente *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={reglaContenido}
                      onChange={(e) => setReglaContenido(e.target.value)}
                      placeholder="Describí con precisión el criterio técnico u operativo a aplicar..."
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-[#0F4C5C]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Vigencia desde
                      </label>
                      <input
                        type="text"
                        value={reglaVigenciaDesde}
                        onChange={(e) => setReglaVigenciaDesde(e.target.value)}
                        placeholder="dd/mm/aaaa"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Fuente normativa
                      </label>
                      <input
                        type="text"
                        value={reglaFuente}
                        onChange={(e) => setReglaFuente(e.target.value)}
                        placeholder="Ej: RG ARCA / Ley 24.977 / Protocolo GR"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0F4C5C] hover:bg-petroleo-dark text-white font-extrabold text-xs shadow-sm transition"
                  >
                    <BookOpen className="w-4 h-4 text-[#FBF8CC]" />
                    <span>Proponer regla para Base_Conocimiento_IA</span>
                  </button>
                </form>
              )}

              {/* Generador 3: Borrador WhatsApp / Telegram (copia manual controlada) */}
              {tabGeneradorN2 === 'borrador_msg' && (
                <div className="rounded-2xl bg-[#F8FAFC] border border-slate-200 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Plantilla
                      </label>
                      <select
                        value={msgPlantilla}
                        onChange={(e) => setMsgPlantilla(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#0F4C5C] focus:outline-none focus:border-[#0F4C5C]"
                      >
                        <option value="vep_pendiente">VEP pendiente</option>
                        <option value="honorarios_pendientes">Honorarios pendientes</option>
                        <option value="pago_confirmado">Pago confirmado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Cliente
                      </label>
                      <input
                        type="text"
                        value={msgCliente}
                        onChange={(e) => setMsgCliente(e.target.value)}
                        placeholder="Ej: Juan"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Período
                      </label>
                      <input
                        type="text"
                        value={msgPeriodo}
                        onChange={(e) => setMsgPeriodo(e.target.value)}
                        placeholder="11/2026"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                        Importe (opcional)
                      </label>
                      <input
                        type="text"
                        value={msgImporte}
                        onChange={(e) => setMsgImporte(e.target.value)}
                        placeholder="Ej: $ 58.027,18"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-white border border-slate-200 p-3.5 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {borradorMensajeTexto}
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-500">
                      Envío manual controlado: copiá el texto y pegalo en WhatsApp o Telegram.
                    </span>
                    <button
                      type="button"
                      onClick={handleCopiarBorradorMensaje}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#E36414] hover:bg-ladrillo-dark text-white font-extrabold text-xs shadow-sm transition active:scale-95"
                    >
                      {msgCopiado ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>¡Mensaje copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar mensaje</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {errorDiagnostico && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorDiagnostico}</span>
          </div>
        )}

        {/* 1. Estado técnico de componentes en tiempo real */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Supervisión Técnica de Componentes
            </h3>
            <span className="text-[11px] font-bold text-slate-500">
              Verde = Operativo • Amarillo = Pendiente de ID • Rojo = Error
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {componentesLista.map((comp) => {
              const est = obtenerEstiloEstado(comp.status);
              const StatusIcon = est.Icon;
              const CompIcon = ICONOS_COMPONENTE[comp.id] || Activity;

              return (
                <article
                  key={comp.id}
                  className={`bg-white rounded-3xl shadow-sm border p-4 sm:p-5 flex flex-col justify-between gap-3 ${est.borderCls}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-petroleo-50 text-[#0F4C5C] flex items-center justify-center shrink-0">
                        <CompIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-[#0F4C5C] leading-snug">
                          {comp.nombre}
                        </h4>
                        <p className="text-xs text-slate-600 mt-1 leading-snug">
                          {comp.detalle}
                        </p>
                      </div>
                    </div>
                  </div>

                  {comp.error && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] font-bold text-red-800 break-words">
                      {comp.error}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-1 rounded-full border ${est.badgeCls}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${est.dotCls}`} />
                      <StatusIcon className="w-3.5 h-3.5" />
                      <span>{est.label}</span>
                    </span>

                    {comp.id === 'arca' && comp.httpCode && (
                      <span className="text-[11px] font-mono font-bold text-slate-500">
                        HTTP {comp.httpCode}
                      </span>
                    )}
                    {comp.id === 'bot1' && comp.ultimoMovimiento?.hojaOrigen && (
                      <span className="text-[11px] font-semibold text-slate-500">
                        {comp.ultimoMovimiento.hojaOrigen} ({comp.ultimoMovimiento.totalFilas} filas)
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* 2. Las 7 Planillas reales del ERP (con expansión de pestañas) */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#0F4C5C] text-[#FBF8CC] flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-[#0F4C5C] leading-tight">
                  Las 7 Planillas del ERP
                </h3>
                <p className="text-xs text-slate-500">
                  Tocá cada libro para ver el detalle de pestañas o el error de conexión
                </p>
              </div>
            </div>
            <span className="text-[11px] font-extrabold bg-petroleo-50 text-[#0F4C5C] border border-petroleo/15 px-3 py-1 rounded-full">
              Solo lectura (Nivel 1)
            </span>
          </div>

          <div className="space-y-2.5">
            {planillasLista.map((libro, idx) => {
              const est = obtenerEstiloEstado(libro.status);
              const StatusIcon = est.Icon;
              const expandida = Boolean(planillasExpandidas[libro.id]);
              const tienePestanas = Array.isArray(libro.sheetNames) && libro.sheetNames.length > 0;

              return (
                <div
                  key={libro.id}
                  className={`rounded-2xl bg-[#F8FAFC] border overflow-hidden transition ${est.borderCls}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpandirPlanilla(libro.id)}
                    className="w-full p-3.5 text-left flex items-center justify-between gap-3 hover:bg-slate-100/70 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-[#0F4C5C] flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-black text-slate-900 leading-tight truncate">
                          {idx + 1}. {libro.nombre}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {libro.status === 'OK'
                            ? `${libro.sheetCount} ${libro.sheetCount === 1 ? 'pestaña' : 'pestañas'}${
                                libro.bookTitle && libro.bookTitle !== libro.nombre
                                  ? ` • Archivo: ${libro.bookTitle}`
                                  : ''
                              }`
                            : libro.propiedad
                              ? `Propiedad: ${libro.propiedad}`
                              : 'Planilla activa del script'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold px-2.5 py-1 rounded-full border ${est.badgeCls}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        <span>{est.label}</span>
                      </span>
                      {expandida ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {expandida && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-200/70 bg-white space-y-2.5">
                      {libro.status === 'OK' && tienePestanas && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                            Pestañas detectadas ({libro.sheetCount})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {libro.sheetNames.map((nombrePestana) => (
                              <span
                                key={nombrePestana}
                                className="text-[11px] font-bold bg-petroleo-50 text-[#0F4C5C] border border-petroleo/15 px-2.5 py-1 rounded-lg"
                              >
                                {nombrePestana}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {libro.status === 'SIN_ID' && (
                        <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          {libro.error ||
                            `Falta configurar la propiedad ${libro.propiedad} en Propiedades del Script de Google Apps Script.`}
                        </p>
                      )}

                      {libro.status === 'ERROR' && (
                        <p className="text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 break-words">
                          <strong>Detalle del error:</strong> {libro.error || 'No se pudo abrir la planilla.'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. Tabla de últimos 10 eventos de Log_Cerebro_IA */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-[#0F4C5C] leading-tight">
                  Registro de actividad — Log_Cerebro_IA
                </h3>
                <p className="text-[11px] text-slate-500">
                  Últimos 10 eventos auditados (del más reciente al más antiguo)
                </p>
              </div>
            </div>
            <span className="text-[11px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full">
              {logsLista.length} registros
            </span>
          </div>

          {logsLista.length === 0 ? (
            <div className="p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 text-center text-xs text-slate-500">
              {cargandoDiagnostico
                ? 'Cargando últimos eventos de Log_Cerebro_IA...'
                : 'No hay eventos registrados todavía en Log_Cerebro_IA.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-[#0F4C5C] text-white text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 font-extrabold">Fecha/Hora</th>
                    <th className="py-2.5 px-3 font-extrabold">Usuario</th>
                    <th className="py-2.5 px-3 font-extrabold">Nivel</th>
                    <th className="py-2.5 px-3 font-extrabold">Herramienta</th>
                    <th className="py-2.5 px-3 font-extrabold">Datos</th>
                    <th className="py-2.5 px-3 font-extrabold">Resultado</th>
                    <th className="py-2.5 px-3 font-extrabold">Autorización</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {logsLista.map((log, idx) => {
                    const resUpper = String(log.resultado || '').toUpperCase();
                    const autUpper = String(log.autorizacion || '').toUpperCase();
                    const resCls =
                      resUpper === 'OK'
                        ? 'bg-emerald-100 text-emerald-900'
                        : resUpper.includes('ALERTA')
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-red-100 text-red-900';
                    const autCls = autUpper.includes('AUTORIZ')
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200';

                    return (
                      <tr key={`${log.fechaHora}-${idx}`} className="hover:bg-slate-50/80 align-top">
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {log.fechaHora}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                          {log.usuario}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#0F4C5C] whitespace-nowrap">
                          {log.nivel}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                          {log.herramienta}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs break-words">
                          {log.datos}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`inline-block font-extrabold text-[10px] px-2 py-0.5 rounded-full ${resCls}`}>
                            {log.resultado}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`inline-block font-extrabold text-[10px] px-2 py-0.5 rounded-full ${autCls}`}>
                            {log.autorizacion}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
