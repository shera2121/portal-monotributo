import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { adminLogin, adminLogout, adminVerifySession } from '../services/api.js';
import {
  eliminarStorageSeguro,
  guardarJsonSeguro,
  leerJsonSeguro
} from '../utils/storage.js';
import LoadingOverlay from './LoadingOverlay.jsx';

const ADMIN_SESSION_KEY = 'gr_cerebro_admin_session_v1';

const MODULOS_ESTADO = [
  {
    id: 'portal',
    titulo: 'Portal de Autogestión (PWA)',
    subtitulo: 'App de clientes, notificaciones Push y descargas PDF',
    estado: 'Etapa 2 pendiente',
    Icon: Smartphone
  },
  {
    id: 'bot1',
    titulo: 'Bot 1 — Registro de Comprobantes',
    subtitulo: 'Captura Telegram / WhatsApp, OCR y clasificación contable',
    estado: 'Etapa 2 pendiente',
    Icon: Bot
  },
  {
    id: 'bot2',
    titulo: 'Bot 2 — Ganancias Autónomo',
    subtitulo: 'Seguimiento impositivo y deducciones de cuarta/tercera categoría',
    estado: 'Etapa 2 pendiente',
    Icon: Cpu
  },
  {
    id: 'arca',
    titulo: 'Puente ARCA',
    subtitulo: 'Facturación electrónica WSAA / WSFEv1 y Constancias',
    estado: 'Etapa 2 pendiente',
    Icon: Globe
  }
];

const PLANILLAS_ERP = [
  { id: 1, nombre: 'Comprobantes', detalle: 'Compras, gastos y tickets registrados' },
  { id: 2, nombre: 'Pedidos de Facturación', detalle: 'Solicitudes y emisiones con CAE' },
  { id: 3, nombre: 'Directorio Clientes', detalle: 'Padrón maestro, CUIT y modalidad ARCA' },
  { id: 4, nombre: 'Semáforo Monotributo', detalle: 'Topes 12M y alertas Art. 20' },
  { id: 5, nombre: 'Conciliación Bancaria y ML', detalle: 'Extractos bancarios y Mercado Pago' },
  { id: 6, nombre: 'Control Honorarios', detalle: 'Liquidación y pagos mensuales' },
  { id: 7, nombre: 'Control Pagos VEP', detalle: 'Seguimiento de VEPs y vencimientos' }
];

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
      setMasterKey('');
      setError('');
      setCerrandoSesion(false);
    }
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
          GR Servicios Contables • Cerebro Central de IA (Etapa 1 — Base de Seguridad)
        </footer>
      </div>
    );
  }

  // PANEL CENTRAL DE ADMINISTRADOR (ESQUELETO VISUAL ETAPA 1)
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <LoadingOverlay visible={cerrandoSesion} message="Cerrando sesión Admin..." />

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
                <span className="opacity-90">Sesión temporal verificada (2 h)</span>
              </p>
            </div>
          </div>

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
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Banner de Etapa 1 */}
        <section className="bg-[#FBF8CC] border border-amber-300/80 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0F4C5C] text-[#FBF8CC] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#E36414] block">
                GR Cerebro Central de IA — Etapa 1 Activa
              </span>
              <h2 className="text-sm sm:text-base font-black text-[#0F4C5C] leading-snug">
                Base de Seguridad, Bitácora de Auditoría y Módulo Admin operativos
              </h2>
              <p className="text-xs text-slate-700 mt-0.5">
                Los módulos operativos y la conexión con Gemini API se habilitarán en la Etapa 2 sin afectar el portal de clientes.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-200 px-3 py-1.5 rounded-full shrink-0 self-start sm:self-center">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Nivel 1 Auditado</span>
          </span>
        </section>

        {/* Tarjetas de estado en preparación: Portal, Bot 1, Bot 2, Puente ARCA */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Ecosistema y Conectores del Estudio
            </h3>
            <span className="text-[11px] font-bold text-slate-500">4 módulos principales</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {MODULOS_ESTADO.map(({ id, titulo, subtitulo, estado, Icon }) => (
              <article
                key={id}
                className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-petroleo-50 text-[#0F4C5C] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-black text-[#0F4C5C] leading-snug">{titulo}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{subtitulo}</p>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-full">
                    <Clock className="w-3 h-3" />
                    <span>{estado}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">Solo lectura / Esqueleto</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Las 7 Planillas del ERP */}
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
                  Integración de lectura/herramientas centralizadas preparada para la siguiente fase
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              <span>Etapa 2 pendiente</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {PLANILLAS_ERP.map((hoja) => (
              <div
                key={hoja.id}
                className="rounded-2xl bg-[#F8FAFC] border border-slate-200/80 p-3 flex items-start gap-2.5"
              >
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-[#0F4C5C] flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-800 leading-tight truncate">
                    {hoja.id}. {hoja.nombre}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{hoja.detalle}</p>
                  <span className="inline-block mt-1.5 text-[10px] font-extrabold text-[#E36414]">
                    Etapa 2 pendiente
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sección Registro de actividad (Auditoría en Log_Cerebro_IA) */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#0F4C5C] leading-tight">
                  Registro de actividad
                </h3>
                <p className="text-[11px] text-slate-500">
                  Bitácora inmutable de seguridad del Cerebro Central
                </p>
              </div>
            </div>
            <span className="text-[11px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full">
              Activo
            </span>
          </div>

          <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 space-y-2 text-xs text-emerald-950">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="font-bold leading-snug">
                Tu acceso de administrador quedó auditado automáticamente en la hoja{' '}
                <strong className="font-mono text-[#0F4C5C]">
                  {sesionAdmin.auditSheet || 'Log_Cerebro_IA'}
                </strong>
                .
              </p>
            </div>
            <div className="pl-6 text-[11px] text-emerald-900/90 space-y-1">
              <p>
                <strong>Usuario:</strong> {sesionAdmin.adminName} (Admin) • <strong>Nivel:</strong> Nivel 1 •{' '}
                <strong>Herramienta:</strong> <span className="font-mono">admin_login</span>
              </p>
              {sesionAdmin.createdAtAR && (
                <p>
                  <strong>Ingreso registrado:</strong> {sesionAdmin.createdAtAR}
                </p>
              )}
              <p>
                <strong>Política de seguridad:</strong> nunca se registran contraseñas, claves maestras ni tokens de sesión en la columna Datos.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
