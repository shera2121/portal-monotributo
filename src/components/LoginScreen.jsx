import React, { useState } from 'react';
import {
  AlertTriangle,
  Fingerprint,
  KeyRound,
  Lock,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck
} from 'lucide-react';
import { DEMO_CREDENTIALS, ESTUDIO_INFO } from '../config.js';
import { cleanCUIT, formatCUIT } from '../utils/fiscalCalculations.js';
import InstallPwaBanner from './InstallPwaBanner.jsx';
import LoadingOverlay from './LoadingOverlay.jsx';

export default function LoginScreen({
  onLogin,
  cargando,
  errorExterno,
  modoDemo,
  onAbrirModoEstudio,
  privacidadAceptada,
  onTogglePrivacidad,
  onAbrirPrivacidad,
  biometriaDisponible,
  motivoSinBiometria,
  perfilBiometrico,
  onLoginBiometrico,
  onEliminarBiometria
}) {
  const [cuitVisual, setCuitVisual] = useState('');
  const [pin, setPin] = useState('');
  const [errorLocal, setErrorLocal] = useState('');
  const [errorBiometria, setErrorBiometria] = useState('');
  const [verificandoBio, setVerificandoBio] = useState(false);

  const handleCuitChange = (e) => {
    setCuitVisual(formatCUIT(e.target.value));
    if (errorLocal) setErrorLocal('');
    if (errorBiometria) setErrorBiometria('');
  };

  const validarConsentimiento = () => {
    if (!privacidadAceptada) {
      setErrorLocal(
        'Debés aceptar la Política de Privacidad y Términos de Uso antes de ingresar.'
      );
      return false;
    }
    return true;
  };

  const cuitLimpioActual = cleanCUIT(cuitVisual);
  const pinLimpioActual = pin.trim();
  const cuitEsValido = /^\d{11}$/.test(cuitLimpioActual);
  const pinEsValido = pinLimpioActual.length > 0;
  const estaProcesandoLogin = Boolean(cargando || verificandoBio);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (estaProcesandoLogin) return;
    setErrorLocal('');
    if (!validarConsentimiento()) return;

    const cuitLimpio = cleanCUIT(cuitVisual);
    const pinLimpio = pin.trim();

    if (!/^\d{11}$/.test(cuitLimpio)) {
      setErrorLocal('Ingresá un CUIT válido de exactamente 11 dígitos numéricos (ej: 20-34567890-4).');
      return;
    }
    if (!pinLimpio) {
      setErrorLocal('Ingresá tu PIN DE ACCESO entregado por el estudio. No puede estar vacío.');
      return;
    }

    await onLogin({ cuit: cuitLimpio, pin: pinLimpio });
  };

  const handleIngresarDemo = async () => {
    if (estaProcesandoLogin || !modoDemo) return;
    setErrorLocal('');
    if (!validarConsentimiento()) return;
    setCuitVisual(DEMO_CREDENTIALS.cuitFormateado);
    setPin(DEMO_CREDENTIALS.pin);
    await onLogin({ cuit: DEMO_CREDENTIALS.cuit, pin: DEMO_CREDENTIALS.pin });
  };

  const handleClickBiometria = async () => {
    if (estaProcesandoLogin) return;
    setErrorLocal('');
    setErrorBiometria('');
    if (!validarConsentimiento()) return;
    setVerificandoBio(true);
    try {
      await onLoginBiometrico();
    } catch (err) {
      // Bloqueo estricto: nunca inicia sesión ante fallo o cancelación
      setErrorBiometria(
        err?.message ||
          'No se pudo validar la huella o el PIN del celular. Intentá nuevamente o ingresá con tu CUIT y PIN del estudio.'
      );
    } finally {
      setVerificandoBio(false);
    }
  };

  const errorMostrar = errorLocal || errorExterno;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between">
      <LoadingOverlay visible={estaProcesandoLogin} message="Ingresando a tu portal..." />
      {/* Cabecera Institucional */}
      <div className="bg-petroleo text-white border-b-4 border-ladrillo px-4 pt-8 pb-12">
        <div className="max-w-md mx-auto text-center space-y-3">
          <div className="w-24 h-24 rounded-full bg-white p-1.5 flex items-center justify-center mx-auto shadow-lg ring-4 ring-white/20">
            <img
              src="/logo-gr.png"
              alt="GR Estudio Impositivo Digital — Germán Read Contador Público"
              className="w-full h-full object-contain rounded-full"
            />
          </div>
          <div>
            <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest px-3 py-0.5 rounded-full bg-white/15 text-hueso">
              {ESTUDIO_INFO.razonSocial}
            </span>
            <h1 className="text-2xl font-black tracking-tight mt-1.5">
              {ESTUDIO_INFO.nombreCompleto}
            </h1>
            <p className="text-xs text-petroleo-100 mt-1">
              Portal de Autogestión Monotributo • Comprobantes, Facturas y Trámites
            </p>
          </div>
        </div>
      </div>

      {/* Tarjeta de Acceso */}
      <main className="flex-1 px-4 -mt-7 pb-8">
        <div className="max-w-md mx-auto">
          <InstallPwaBanner />

          <section className="bg-white rounded-3xl shadow-xl border border-slate-200/80 p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-11 h-11 rounded-2xl bg-petroleo-50 text-petroleo flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-petroleo leading-tight">
                  Acceso de Clientes
                </h2>
                <p className="text-xs text-slate-500">
                  Ingresá una sola vez: tu sesión queda guardada en el celular.
                </p>
              </div>
            </div>

            {/* INGRESO RÁPIDO CON BIOMETRÍA / PIN DEL CELULAR (SI ESTÁ VINCULADO) */}
            {biometriaDisponible && perfilBiometrico && (
              <div className="bg-petroleo-50/90 border-2 border-petroleo/25 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-petroleo block">
                      Acceso rápido en este dispositivo
                    </span>
                    <p className="text-sm font-black text-slate-900 truncate mt-0.5">
                      {perfilBiometrico.nombre || 'Contribuyente'}
                    </p>
                    <p className="text-xs font-mono text-slate-600">
                      CUIT: {formatCUIT(perfilBiometrico.cuit)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onEliminarBiometria}
                    title="Quitar acceso biométrico de este dispositivo"
                    className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={cargando || verificandoBio}
                  onClick={handleClickBiometria}
                  className="w-full py-3.5 px-4 rounded-2xl bg-petroleo hover:bg-petroleo-dark disabled:opacity-60 text-white font-extrabold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99]"
                >
                  <Fingerprint className="w-5 h-5 text-hueso shrink-0" />
                  <span>
                    {verificandoBio
                      ? 'Verificando identidad del celular...'
                      : 'Ingresar con huella / rostro o PIN del celular'}
                  </span>
                </button>

                {errorBiometria && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorBiometria}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-0.5">
                  <div className="h-px bg-petroleo/15 flex-1" />
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    o ingresá con CUIT y PIN
                  </span>
                  <div className="h-px bg-petroleo/15 flex-1" />
                </div>
              </div>
            )}

            {/* AVISO EXPLICATIVO SI EL DISPOSITIVO NO SOPORTA WEBAUTHN O NO TIENE BIOMETRÍA */}
            {!biometriaDisponible && motivoSinBiometria && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-start gap-2">
                <Fingerprint className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>{motivoSinBiometria}</span>
              </div>
            )}

            {modoDemo && (
              <div className="bg-hueso border border-hueso-border rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-ladrillo shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-800 space-y-0.5">
                    <p className="font-extrabold text-petroleo">Modo Demostración Activo (Salta — Servicios)</p>
                    <p>
                      CUIT: <strong className="font-mono">{DEMO_CREDENTIALS.cuitFormateado}</strong> • PIN:{' '}
                      <strong className="font-mono">{DEMO_CREDENTIALS.pin}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleIngresarDemo}
                  disabled={cargando}
                  className="w-full py-2.5 px-3 rounded-xl bg-petroleo hover:bg-petroleo-dark text-white text-xs font-extrabold transition active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4 text-hueso" />
                  <span>Ingresar rápido con Cuenta Demo</span>
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-cuit" className="block text-xs font-extrabold uppercase tracking-wide text-petroleo mb-1.5">
                  1. CUIT (11 dígitos)
                </label>
                <input
                  id="login-cuit"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  required
                  value={cuitVisual}
                  onChange={handleCuitChange}
                  placeholder="20-34567890-4"
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-base font-bold tracking-wide text-slate-900 focus:outline-none focus:border-petroleo transition"
                />
              </div>

              <div>
                <label htmlFor="login-pin" className="block text-xs font-extrabold uppercase tracking-wide text-petroleo mb-1.5">
                  2. PIN DE ACCESO
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-pin"
                    type="text"
                    inputMode="numeric"
                    autoComplete="current-password"
                    required
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value);
                      if (errorLocal) setErrorLocal('');
                    }}
                    placeholder="Ej: 1450788980"
                    className="w-full pl-10 pr-4 py-3.5 rounded-2xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-base font-bold text-slate-900 focus:outline-none focus:border-petroleo transition"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Es el código personal provisto por el estudio (compatible con tu anterior código de Telegram).
                </p>
              </div>

              {/* CASILLA OBLIGATORIA DE POLÍTICA DE PRIVACIDAD Y TÉRMINOS */}
              <div className="rounded-2xl bg-[#F8FAFC] border border-slate-200 p-3.5 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={privacidadAceptada}
                    onChange={(e) => {
                      onTogglePrivacidad(e.target.checked);
                      if (errorLocal) setErrorLocal('');
                    }}
                    className="mt-0.5 w-4 h-4 rounded accent-[#0F4C5C] shrink-0 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 leading-snug">
                    Leí y acepto la{' '}
                    <strong>Política de Privacidad (Ley 25.326)</strong> y los{' '}
                    <strong>Términos de Uso</strong> de GR Servicios Contables, incluido el procesamiento asistido por IA de comprobantes.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={onAbrirPrivacidad}
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-petroleo hover:text-ladrillo underline ml-6 transition"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Ver Política de Privacidad y Términos</span>
                </button>
              </div>

              {errorMostrar && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMostrar}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={estaProcesandoLogin || !privacidadAceptada || !cuitEsValido || !pinEsValido}
                className="w-full bg-ladrillo hover:bg-ladrillo-dark disabled:opacity-50 text-white font-extrabold text-sm py-4 rounded-2xl shadow-md transition active:scale-[0.99]"
              >
                {estaProcesandoLogin ? 'Ingresando a tu portal...' : 'Ingresar a mi Portal'}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                Conexión segura vía estudio
              </span>
              <button
                type="button"
                onClick={onAbrirModoEstudio}
                className="font-bold text-petroleo hover:underline shrink-0"
              >
                Modo Estudio
              </button>
            </div>
          </section>
        </div>
      </main>

      <footer className="text-center text-[11px] text-slate-400 pb-6 px-4 space-y-1">
        <p>GR Estudio Impositivo Digital • GR Servicios Contables</p>
        <button
          type="button"
          onClick={onAbrirPrivacidad}
          className="text-petroleo font-bold hover:underline"
        >
          Política de Privacidad y Términos de Uso
        </button>
      </footer>
    </div>
  );
}
