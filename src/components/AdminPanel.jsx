import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Wrench
} from 'lucide-react';
import {
  adminCerebroChat,
  adminHealthcheck,
  adminLogin,
  adminLogout,
  adminVerifySession
} from '../services/api.js';
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
  'Revisá alertas de ARCA y próximos vencimientos'
];

const ETIQUETAS_HERRAMIENTAS = {
  buscar_cliente: 'Buscar cliente',
  consultar_veps: 'Consultar VEPs',
  consultar_honorarios: 'Consultar honorarios',
  consultar_vencimientos_y_alertas: 'Vencimientos y Alertas ARCA'
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

  // Estado del Chat Central — GR Cerebro de IA (Etapa 3 — Nivel 1 Function Calling)
  const [mensajesChat, setMensajesChat] = useState([]);
  const [inputChat, setInputChat] = useState('');
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [errorChat, setErrorChat] = useState('');
  const chatEndRef = useRef(null);

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
    setErrorDiagnostico('');
    setErrorChat('');
    setError(mensaje || 'Tu sesión de administrador expiró. Ingresá nuevamente tu Clave Maestra.');
  }, []);

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
        visible={cerrandoSesion || (cargandoDiagnostico && !healthData)}
        message={
          cerrandoSesion
            ? 'Cerrando sesión Admin...'
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
                Etapa 3 — Motor Gemini 3.8 Flash (Function Calling) + Supervisión Técnica
              </span>
              <h2 className="text-sm sm:text-base font-black text-[#0F4C5C] leading-snug">
                Chat Central de consulta sobre planillas reales y diagnóstico del estudio
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
                  Gemini 3.8 Flash • 4 herramientas Nivel 1 (Clientes, VEPs, Honorarios, Vencimientos y Alertas)
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
                          className={`text-[10px] text-right ${
                            esUsuario ? 'text-petroleo-100/80' : 'text-slate-400'
                          }`}
                        >
                          {msg.hora}
                          {!esUsuario && msg.model ? ` • ${msg.model}` : ''}
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
