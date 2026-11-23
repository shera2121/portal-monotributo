import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Mic, MicOff, Sparkles, Square } from 'lucide-react';

/**
 * Botón reutilizable de dictado por voz en Español Argentina (es-AR)
 * usando la Web Speech API nativa y gratuita del navegador.
 */
export default function VoiceInputButton({
  titulo = 'Dictar por voz',
  ejemplo = '',
  onResultadoFinal,
  className = ''
}) {
  const recognitionRef = useRef(null);
  const textoFinalRef = useRef('');

  const [escuchando, setEscuchando] = useState(false);
  const [textoEnVivo, setTextoEnVivo] = useState('');
  const [avisoCompat, setAvisoCompat] = useState('');

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignorar al desmontar
      }
    };
  }, []);

  const obtenerSpeechRecognition = () => {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  };

  const detener = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignorar
    }
    setEscuchando(false);
  };

  const iniciar = () => {
    setAvisoCompat('');
    const SpeechRec = obtenerSpeechRecognition();

    // 1. Verificar soporte del navegador
    if (!SpeechRec) {
      setAvisoCompat(
        'Tu navegador no soporta dictado integrado. Podés usar Chrome/Edge o el ícono de micrófono del teclado de tu celular.'
      );
      return;
    }

    // 2. Verificar contexto seguro (HTTPS o localhost)
    const esLocal =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !esLocal) {
      setAvisoCompat(
        'El micrófono requiere conexión segura HTTPS (funcionará automáticamente al publicar en Vercel). Mientras tanto podés usar el dictado del teclado de tu celular.'
      );
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'es-AR';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      textoFinalRef.current = '';
      setTextoEnVivo('');

      recognition.onstart = () => {
        setEscuchando(true);
      };

      recognition.onresult = (event) => {
        let finalStr = '';
        let interimStr = '';
        for (let i = 0; i < event.results.length; i += 1) {
          const transcript = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalStr += `${transcript} `;
          } else {
            interimStr += transcript;
          }
        }
        const combinado = `${finalStr}${interimStr}`.trim();
        textoFinalRef.current = combinado;
        setTextoEnVivo(combinado);
      };

      recognition.onerror = (event) => {
        setEscuchando(false);
        const err = event?.error || '';
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setAvisoCompat(
            'Permiso de micrófono bloqueado o entorno HTTP sin HTTPS. En Vercel (HTTPS) funcionará directo; también podés usar el dictado del teclado.'
          );
        } else if (err === 'no-speech') {
          setAvisoCompat('No escuchamos voz. Tocá el micrófono y hablá cerca del celular.');
        } else if (err === 'network') {
          setAvisoCompat(
            'El reconocimiento de voz necesita conexión a internet. También podés usar el micrófono del teclado.'
          );
        } else if (err !== 'aborted') {
          setAvisoCompat(
            'No se pudo iniciar el micrófono en este dispositivo. Podés usar el dictado del teclado del celular.'
          );
        }
      };

      recognition.onend = () => {
        setEscuchando(false);
        const finalTranscript = textoFinalRef.current.trim();
        if (finalTranscript && onResultadoFinal) {
          onResultadoFinal(finalTranscript);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setEscuchando(false);
      setAvisoCompat(
        'No se pudo activar el micrófono (requiere HTTPS en producción). Podés usar el dictado del teclado de tu celular.'
      );
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        className={`rounded-2xl border-2 p-3 transition ${
          escuchando
            ? 'bg-ladrillo-50 border-ladrillo shadow-md'
            : 'bg-hueso/65 border-hueso-border'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-ladrillo shrink-0" />
              <span className="text-xs font-black text-petroleo leading-tight">{titulo}</span>
            </div>
            {ejemplo && !escuchando && (
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{ejemplo}</p>
            )}
            {escuchando && (
              <p className="text-[11px] font-bold text-ladrillo-dark mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping shrink-0" />
                Escuchando en español (AR)... hablá con normalidad.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={escuchando ? detener : iniciar}
            className={`relative shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition active:scale-95 ${
              escuchando
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-petroleo hover:bg-petroleo-dark text-white'
            }`}
          >
            {escuchando ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Listo</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-hueso" />
                <span>Dictar</span>
              </>
            )}
          </button>
        </div>

        {/* Transcripción en vivo */}
        {textoEnVivo && (
          <div className="mt-2.5 pt-2 border-t border-black/10 text-xs text-slate-800 bg-white/80 rounded-xl px-3 py-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-petroleo block mb-0.5">
              {escuchando ? 'Transcribiendo en vivo:' : 'Último dictado escuchado:'}
            </span>
            <p className="font-semibold italic text-slate-800">“{textoEnVivo}”</p>
          </div>
        )}
      </div>

      {avisoCompat && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-950 flex items-start gap-2">
          {avisoCompat.includes('HTTPS') ? (
            <MicOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          )}
          <span>{avisoCompat}</span>
        </div>
      )}
    </div>
  );
}
