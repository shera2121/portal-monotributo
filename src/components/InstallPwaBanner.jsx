import React, { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { leerStorageSeguro, guardarStorageSeguro } from '../utils/storage.js';

const DISMISS_KEY = 'gr_pwa_install_dismissed_v1';

export default function InstallPwaBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(() => leerStorageSeguro(DISMISS_KEY) === 'true');
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true;
    setIsStandalone(Boolean(standalone));

    const ua = window.navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    setIsIos(ios);

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (isStandalone || dismissed) return null;

  // Mostrar si Android/Desktop disparó beforeinstallprompt, o si es iOS Safari, o aviso amigable en navegador móvil
  const esMovil = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (!deferredPrompt && !isIos && !esMovil) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setShowIosGuide((prev) => !prev);
    } else {
      setShowIosGuide((prev) => !prev);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    guardarStorageSeguro(DISMISS_KEY, 'true');
  };

  return (
    <div className="bg-hueso border border-hueso-border rounded-2xl p-3.5 shadow-sm mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-petroleo text-white flex items-center justify-center shrink-0 shadow-sm">
            <Smartphone className="w-5 h-5 text-hueso" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-petroleo leading-tight">
              Instalar app en tu celular
            </p>
            <p className="text-[11px] text-slate-700 leading-snug mt-0.5">
              Abrí GR Estudio desde tu pantalla de inicio como una app nativa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 bg-ladrillo hover:bg-ladrillo-dark text-white text-xs font-extrabold px-3 py-2 rounded-xl shadow-sm transition active:scale-95"
          >
            {isIos ? <Share className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            <span>{deferredPrompt ? 'Instalar' : 'Cómo instalar'}</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Ocultar aviso de instalación"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-black/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showIosGuide && (
        <div className="mt-3 pt-2.5 border-t border-hueso-border text-[11px] text-slate-700 space-y-1">
          {isIos ? (
            <>
              <p className="font-bold text-petroleo">En iPhone / iPad (Safari):</p>
              <p>1. Tocá el botón <strong>Compartir</strong> en la barra inferior.</p>
              <p>2. Elegí <strong>“Agregar a inicio”</strong> y luego <strong>“Agregar”</strong>.</p>
            </>
          ) : (
            <>
              <p className="font-bold text-petroleo">En Android (Chrome):</p>
              <p>1. Tocá el menú <strong>⋮</strong> arriba a la derecha.</p>
              <p>2. Elegí <strong>“Instalar aplicación”</strong> o <strong>“Agregar a la pantalla principal”</strong>.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
