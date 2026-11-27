import React from 'react';

/**
 * Indicador visual de espera corporativo de GR Servicios Contables.
 * Bloquea toques accidentales en pantalla completa mientras se valida sesión,
 * se inicia sesión o se procesa/envía un comprobante.
 */
export default function LoadingOverlay({
  visible = true,
  message = 'Procesando...',
  subtitle = 'Aguardá un instante, por favor'
}) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 bg-[#0F4C5C]/85 backdrop-blur-sm flex items-center justify-center p-6 select-none touch-none"
    >
      <div className="w-full max-w-xs bg-[#FBF8CC] border-2 border-white/80 rounded-3xl shadow-2xl px-6 py-7 text-center space-y-4">
        {/* Logotipo circular GR rodeado por anillo giratorio naranja ladrillo */}
        <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-[#E36414]/20" />
          <div
            className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#E36414] border-r-[#E36414]/80 animate-spin"
            aria-hidden="true"
          />
          <div className="w-[72px] h-[72px] rounded-full bg-white p-1.5 shadow-md flex items-center justify-center overflow-hidden">
            <img
              src="/logo-gr.png"
              alt="GR Servicios Contables"
              className="w-full h-full object-contain rounded-full"
            />
          </div>
        </div>

        {/* Textos dinámicos */}
        <div className="space-y-1">
          <p className="text-base font-black text-[#0F4C5C] leading-snug">
            {message || 'Procesando...'}
          </p>
          <p className="text-xs font-semibold text-slate-700">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
