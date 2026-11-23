import React from 'react';
import { BarChart3, Clock, FileText, Home, Plus } from 'lucide-react';

export default function BottomNav({ tabActiva, onChangeTab, badgeAlertas = 0 }) {
  const NavBtn = ({ id, label, IconComp, badge = 0 }) => {
    const activa = tabActiva === id;
    return (
      <button
        type="button"
        onClick={() => onChangeTab(id)}
        className={`relative flex flex-col items-center justify-center py-2 px-1 flex-1 transition ${
          activa ? 'text-petroleo' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <div className="relative">
          <IconComp className={`w-5 h-5 ${activa ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
          {badge > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-ladrillo text-white text-[10px] font-black flex items-center justify-center">
              {badge}
            </span>
          )}
        </div>
        <span className={`text-[10px] mt-1 leading-none ${activa ? 'font-extrabold text-petroleo' : 'font-semibold'}`}>
          {label}
        </span>
        {activa && <span className="w-5 h-0.5 rounded-full bg-ladrillo mt-1" />}
      </button>
    );
  };

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none"
    >
      <div className="w-full max-w-xl bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-6px_24px_rgba(15,76,92,0.10)] pointer-events-auto pb-safe">
        <div className="grid grid-cols-5 items-end px-1 pt-1">
          <NavBtn id="inicio" label="Inicio" IconComp={Home} badge={badgeAlertas} />
          <NavBtn id="facturar" label="Facturar" IconComp={FileText} />

          {/* BOTÓN CENTRAL ELEVADO (+) */}
          <div className="flex flex-col items-center justify-center -mt-6 pb-1">
            <button
              type="button"
              onClick={() => onChangeTab('cargar')}
              aria-label="Cargar comprobante"
              className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-4 border-[#F8FAFC] transition active:scale-95 ${
                tabActiva === 'cargar'
                  ? 'bg-petroleo ring-2 ring-ladrillo'
                  : 'bg-ladrillo hover:bg-ladrillo-dark'
              }`}
            >
              <Plus className="w-7 h-7 stroke-[2.8]" />
            </button>
            <span
              className={`text-[10px] mt-0.5 leading-none ${
                tabActiva === 'cargar' ? 'font-extrabold text-ladrillo' : 'font-bold text-slate-600'
              }`}
            >
              Cargar
            </span>
          </div>

          <NavBtn id="historial" label="Historial" IconComp={Clock} />
          <NavBtn id="informe" label="Mi Informe" IconComp={BarChart3} />
        </div>
      </div>
    </nav>
  );
}
