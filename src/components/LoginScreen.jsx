import React, { useState } from 'react';
import { AlertTriangle, KeyRound, Lock, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { DEMO_CREDENTIALS, ESTUDIO_INFO } from '../config.js';
import { cleanCUIT, formatCUIT } from '../utils/fiscalCalculations.js';
import InstallPwaBanner from './InstallPwaBanner.jsx';

export default function LoginScreen({
  onLogin,
  cargando,
  errorExterno,
  modoDemo,
  onAbrirModoEstudio
}) {
  const [cuitVisual, setCuitVisual] = useState('');
  const [pin, setPin] = useState('');
  const [errorLocal, setErrorLocal] = useState('');

  const handleCuitChange = (e) => {
    setCuitVisual(formatCUIT(e.target.value));
    if (errorLocal) setErrorLocal('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorLocal('');
    const cuitLimpio = cleanCUIT(cuitVisual);
    const pinLimpio = pin.trim();

    if (cuitLimpio.length !== 11) {
      setErrorLocal('Ingresá un CUIT válido de 11 dígitos (ej: 20-34567890-4).');
      return;
    }
    if (pinLimpio.length < 4) {
      setErrorLocal('Ingresá tu PIN DE ACCESO entregado por el estudio.');
      return;
    }

    await onLogin({ cuit: cuitLimpio, pin: pinLimpio });
  };

  const handleIngresarDemo = async () => {
    setCuitVisual(DEMO_CREDENTIALS.cuitFormateado);
    setPin(DEMO_CREDENTIALS.pin);
    setErrorLocal('');
    await onLogin({ cuit: DEMO_CREDENTIALS.cuit, pin: DEMO_CREDENTIALS.pin });
  };

  const errorMostrar = errorLocal || errorExterno;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between">
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

              {errorMostrar && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMostrar}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="w-full bg-ladrillo hover:bg-ladrillo-dark disabled:opacity-60 text-white font-extrabold text-sm py-4 rounded-2xl shadow-md transition active:scale-[0.99]"
              >
                {cargando ? 'Verificando acceso...' : 'Ingresar a mi Portal'}
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

      <footer className="text-center text-[11px] text-slate-400 pb-6 px-4">
        GR Estudio Impositivo Digital • GR Servicios Contables
      </footer>
    </div>
  );
}
