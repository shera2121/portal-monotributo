import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Megaphone,
  Sparkles,
  X
} from 'lucide-react';

const ESTILOS_NOVEDAD = {
  petroleo: {
    card: 'bg-petroleo text-white border border-petroleo-dark',
    badge: 'bg-white/15 text-hueso border border-hueso/30',
    desc: 'text-petroleo-100',
    btn: 'bg-white hover:bg-hueso text-petroleo',
    modalHeader: 'bg-petroleo text-white',
    dotActive: 'bg-petroleo w-5',
    Icon: Megaphone
  },
  naranja: {
    card: 'bg-ladrillo text-white border border-ladrillo-dark',
    badge: 'bg-white/20 text-white border border-white/30',
    desc: 'text-orange-50',
    btn: 'bg-white hover:bg-hueso text-ladrillo-dark',
    modalHeader: 'bg-ladrillo text-white',
    dotActive: 'bg-ladrillo w-5',
    Icon: Sparkles
  },
  alerta: {
    card: 'bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 text-red-950 border-2 border-red-300/80',
    badge: 'bg-red-100 text-red-800 border border-red-200',
    desc: 'text-red-900/90',
    btn: 'bg-red-600 hover:bg-red-700 text-white',
    modalHeader: 'bg-red-600 text-white',
    dotActive: 'bg-red-600 w-5',
    Icon: AlertTriangle
  },
  verde: {
    card: 'bg-emerald-700 text-white border border-emerald-800',
    badge: 'bg-white/15 text-emerald-50 border border-white/30',
    desc: 'text-emerald-50/95',
    btn: 'bg-white hover:bg-emerald-50 text-emerald-800',
    modalHeader: 'bg-emerald-700 text-white',
    dotActive: 'bg-emerald-700 w-5',
    Icon: Megaphone
  }
};

function obtenerConfigEstilo(estiloRaw) {
  const key = String(estiloRaw || 'petroleo').trim().toLowerCase();
  return ESTILOS_NOVEDAD[key] || ESTILOS_NOVEDAD.petroleo;
}

function esEnlaceValido(url) {
  const limpio = String(url || '').trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(limpio);
}

export default function NovedadesBanner({ novedades = [] }) {
  const lista = Array.isArray(novedades)
    ? novedades.filter((n) => n && (n.titulo || n.descripcion))
    : [];

  const trackRef = useRef(null);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const [novedadModal, setNovedadModal] = useState(null);

  useEffect(() => {
    if (indiceActivo >= lista.length && lista.length > 0) {
      setIndiceActivo(0);
    }
  }, [lista.length, indiceActivo]);

  if (lista.length === 0) return null;

  const esCarrusel = lista.length > 1;

  const irAlIndice = (nuevoIndice) => {
    const clamped = ((nuevoIndice % lista.length) + lista.length) % lista.length;
    setIndiceActivo(clamped);
    const el = trackRef.current;
    if (el) {
      el.scrollTo({
        left: clamped * el.clientWidth,
        behavior: 'smooth'
      });
    }
  };

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx >= 0 && idx < lista.length && idx !== indiceActivo) {
      setIndiceActivo(idx);
    }
  };

  const handleAccionNovedad = (item) => {
    const url = String(item?.enlaceUrl || '').trim();
    if (esEnlaceValido(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    setNovedadModal(item);
  };

  const renderTarjeta = (item, idx) => {
    const cfg = obtenerConfigEstilo(item.estilo);
    const Icono = cfg.Icon;
    const tieneEnlace = esEnlaceValido(item.enlaceUrl);
    const textoBoton = String(item.textoBoton || '').trim() || (tieneEnlace ? 'Ver más' : 'Leer aviso');

    return (
      <div
        key={item.id || `nov-${idx}`}
        className={esCarrusel ? 'w-full shrink-0 snap-center px-0.5' : 'w-full'}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleAccionNovedad(item)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAccionNovedad(item);
            }
          }}
          className={`w-full rounded-3xl p-4 sm:p-5 shadow-sm transition active:scale-[0.99] cursor-pointer space-y-2.5 ${cfg.card}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {item.etiqueta && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${cfg.badge}`}
                >
                  <Icono className="w-3 h-3 shrink-0" />
                  <span>{item.etiqueta}</span>
                </span>
              )}
            </div>
            {esCarrusel && (
              <span className="text-[10px] font-extrabold opacity-75 shrink-0">
                {idx + 1} / {lista.length}
              </span>
            )}
          </div>

          <div className="space-y-1">
            {item.titulo && (
              <h3 className="text-sm sm:text-base font-black leading-snug">
                {item.titulo}
              </h3>
            )}
            {item.descripcion && (
              <p className={`text-xs leading-relaxed line-clamp-2 ${cfg.desc}`}>
                {item.descripcion}
              </p>
            )}
          </div>

          <div className="pt-0.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAccionNovedad(item);
              }}
              className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95 ${cfg.btn}`}
            >
              <span>{textoBoton}</span>
              {tieneEnlace ? (
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <section aria-label="Novedades del estudio" className="space-y-2">
        {esCarrusel ? (
          <div className="relative">
            <div
              ref={trackRef}
              onScroll={handleScroll}
              className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {lista.map((item, idx) => renderTarjeta(item, idx))}
            </div>

            {/* Controles suaves + indicadores de puntos */}
            <div className="flex items-center justify-between gap-2 px-1 pt-2">
              <button
                type="button"
                onClick={() => irAlIndice(indiceActivo - 1)}
                aria-label="Novedad anterior"
                className="w-7 h-7 rounded-full bg-white border border-slate-200/90 text-petroleo hover:bg-petroleo-50 shadow-sm flex items-center justify-center transition active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Seleccionar novedad">
                {lista.map((item, idx) => {
                  const activo = idx === indiceActivo;
                  const cfg = obtenerConfigEstilo(item.estilo);
                  return (
                    <button
                      key={item.id || `dot-${idx}`}
                      type="button"
                      role="tab"
                      aria-selected={activo}
                      aria-label={`Ir a novedad ${idx + 1}`}
                      onClick={() => irAlIndice(idx)}
                      className={`h-2 rounded-full transition-all duration-200 ${
                        activo ? cfg.dotActive : 'w-2 bg-slate-300 hover:bg-slate-400'
                      }`}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => irAlIndice(indiceActivo + 1)}
                aria-label="Siguiente novedad"
                className="w-7 h-7 rounded-full bg-white border border-slate-200/90 text-petroleo hover:bg-petroleo-50 shadow-sm flex items-center justify-center transition active:scale-95"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          renderTarjeta(lista[0], 0)
        )}
      </section>

      {/* MODAL DETALLE DE NOVEDAD (cuando no tiene enlaceUrl) */}
      {novedadModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setNovedadModal(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`px-5 py-4 flex items-center justify-between gap-2 ${
                obtenerConfigEstilo(novedadModal.estilo).modalHeader
              }`}
            >
              <div className="min-w-0">
                {novedadModal.etiqueta && (
                  <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-90 block">
                    {novedadModal.etiqueta}
                  </span>
                )}
                <h4 className="font-black text-sm sm:text-base leading-tight">
                  {novedadModal.titulo || 'Novedad del estudio'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setNovedadModal(null)}
                aria-label="Cerrar novedad"
                className="p-1.5 rounded-xl hover:bg-white/15 shrink-0 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {novedadModal.descripcion && (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {novedadModal.descripcion}
                </p>
              )}

              <button
                type="button"
                onClick={() => setNovedadModal(null)}
                className="w-full py-3 rounded-2xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-sm transition active:scale-[0.99]"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
