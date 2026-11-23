import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CheckCircle2,
  PieChart,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShoppingBag
} from 'lucide-react';
import {
  FACTOR_IPC,
  TOPE_CATEGORIA_K_VIGENTE,
  TOPE_MAXIMO_ANUAL
} from '../data/escalasMonotributo.js';
import {
  formatARS,
  formatearInputMiles,
  parseInputSimulador,
  parseMontoSeguro
} from '../utils/fiscalCalculations.js';
import { BarComparativaChart, DoughnutMedidorIndividual } from './ChartsMonotributo.jsx';

export default function MiInformeTab({
  cliente,
  calculos,
  montoSimuladoVentas,
  setMontoSimuladoVentas,
  montoSimuladoCompras,
  setMontoSimuladoCompras,
  actualizando,
  onActualizarInforme
}) {
  const haySimulacion = montoSimuladoVentas > 0 || montoSimuladoCompras > 0;

  // Estados y colores INDEPENDIENTES para cada medidor del Semáforo
  const superaVentasCatActual = calculos.ventasTotales > calculos.topeCat;
  const precaucionVentas = !superaVentasCatActual && calculos.porcentaje >= 80;
  const colorVentasHex = superaVentasCatActual
    ? '#dc2626'
    : precaucionVentas
      ? '#d97706'
      : '#0F4C5C';
  const badgeVentas = superaVentasCatActual
    ? { texto: 'Supera tope', cls: 'bg-red-100 text-red-800 border-red-200' }
    : precaucionVentas
      ? { texto: 'Precaución ≥80%', cls: 'bg-amber-100 text-amber-900 border-amber-200' }
      : { texto: 'En regla', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };

  const colorGastosHex = calculos.alertaExclusionGastos
    ? '#dc2626'
    : calculos.alertaPrecaucionGastos
      ? '#d97706'
      : '#16a34a';
  const badgeGastos = calculos.alertaExclusionGastos
    ? { texto: 'Exclusión Art. 20', cls: 'bg-red-100 text-red-800 border-red-200' }
    : calculos.alertaPrecaucionGastos
      ? { texto: 'Alerta ≥75%', cls: 'bg-amber-100 text-amber-900 border-amber-200' }
      : { texto: 'Dentro del tope', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };

  // Motivo exacto de exclusión / alerta crítica para la tarjeta del Simulador
  const esExclusion =
    calculos.alertaExclusionGastos ||
    calculos.superaMaximoMonotributo ||
    String(calculos.categoriaProyectada || '').toUpperCase().includes('EXCLUSIÓN');

  let motivoCriticoSimulador = '';
  if (calculos.alertaExclusionGastos && calculos.superaMaximoMonotributo) {
    motivoCriticoSimulador = 'Motivo: Supera ambos topes (Ventas y Gastos Art. 20)';
  } else if (calculos.alertaExclusionGastos) {
    motivoCriticoSimulador = `Motivo: Gastos/Compras superan el ${calculos.porcLimiteTexto} del tope de Categoría K (Art. 20)`;
  } else if (calculos.superaMaximoMonotributo) {
    motivoCriticoSimulador = 'Motivo: Ventas superan el tope máximo de Categoría K';
  } else if (superaVentasCatActual) {
    motivoCriticoSimulador = `Motivo: Ventas superan el tope de Categoría ${cliente.Categoria_Actual} — Corresponde recategorizar a Cat. ${calculos.categoriaProyectadaVentas}`;
  }

  return (
    <div className="space-y-4">
      {/* Cabecera + Botón Actualizar Informe */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-lg font-black text-petroleo leading-tight">Mi Informe y Simulador</h2>
          <p className="text-xs text-slate-500">Últimos 12 meses • Escalas ARCA (Factor IPC {FACTOR_IPC})</p>
        </div>
        <button
          type="button"
          disabled={actualizando}
          onClick={onActualizarInforme}
          className="inline-flex items-center gap-1.5 bg-petroleo hover:bg-petroleo-dark disabled:opacity-60 text-white text-xs font-extrabold px-3.5 py-2.5 rounded-xl shadow-sm transition active:scale-95 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${actualizando ? 'animate-spin' : ''}`} />
          <span>{actualizando ? 'Actualizando...' : 'Actualizar Informe'}</span>
        </button>
      </div>

      {/* BANNER ALERTA CRÍTICA ART. 20 (100%+) */}
      {calculos.alertaExclusionGastos && (
        <div className="bg-red-600 text-white rounded-3xl p-4 shadow-lg border-2 border-red-300 space-y-2 animate-pulse-alert">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-hueso shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest bg-red-900/70 px-2 py-0.5 rounded text-hueso">
                Art. 20 Ley Monotributo • {calculos.porcentajeComprasArt20.toFixed(1)}% del Tope Cat. K
              </span>
              <p className="text-xs sm:text-sm font-extrabold mt-1 leading-snug">
                RIESGO DE EXCLUSIÓN: Tus compras/gastos ({formatARS(calculos.comprasTotales)}) superan en{' '}
                {formatARS(calculos.excesoGastosArt20)} el límite del {calculos.porcLimiteTexto} sobre la Categoría K ({formatARS(calculos.limiteComprasArt20CatK)}).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* BANNER ALERTA PREVENTIVA ART. 20 (75% - 99.9%) */}
      {calculos.alertaPrecaucionGastos && (
        <div className="bg-amber-50 border-2 border-amber-400 text-amber-950 rounded-3xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-black uppercase text-amber-800">
              Alerta Preventiva Art. 20 (≥ 75% de Categoría K)
            </p>
            <p className="font-semibold leading-snug">
              Llevás consumido el <strong>{calculos.porcentajeComprasArt20.toFixed(1)}%</strong> de tu límite anual de compras ({calculos.porcLimiteTexto} sobre Cat. K: {formatARS(calculos.limiteComprasArt20CatK)}). Margen restante: <strong>{formatARS(calculos.margenGastosDisponible)}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* 1. PANEL REAL (ÚLTIMOS 12 MESES) + BARRAS VS CAT. ACTUAL Y CAT. K */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-ladrillo">
              Estado 12 meses {haySimulacion ? '(Con simulación activa)' : '(Datos reales)'}
            </span>
            <h3 className="text-base font-black text-petroleo">
              Categoría {cliente.Categoria_Actual} • {cliente.Actividad}
            </h3>
          </div>
          <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full border ${calculos.bgBadge}`}>
            {calculos.tituloEstado}
          </span>
        </div>

        {/* Diagnóstico */}
        <div className={`p-3.5 rounded-2xl border-l-4 text-xs font-bold leading-relaxed ${calculos.bgBanner}`}>
          {calculos.mensajeSemaforo}
        </div>

        {/* KPIs principales */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-petroleo-50/80 p-3.5 rounded-2xl border border-petroleo/20">
            <span className="text-[10px] font-extrabold uppercase text-petroleo block">Facturación 12m</span>
            <p className="text-base sm:text-lg font-black text-petroleo mt-0.5">
              {formatARS(calculos.ventasTotales)}
            </p>
            <span className="text-[11px] font-bold text-slate-600">
              {calculos.porcentaje.toFixed(1)}% de Cat. {cliente.Categoria_Actual}
            </span>
          </div>

          <div
            className={`p-3.5 rounded-2xl border ${
              calculos.alertaExclusionGastos
                ? 'bg-red-50 border-red-300'
                : calculos.alertaPrecaucionGastos
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-ladrillo-50 border-ladrillo/25'
            }`}
          >
            <span className="text-[10px] font-extrabold uppercase text-ladrillo-dark block">Compras / Gastos 12m</span>
            <p
              className={`text-base sm:text-lg font-black mt-0.5 ${
                calculos.alertaExclusionGastos ? 'text-red-700' : 'text-ladrillo'
              }`}
            >
              {formatARS(calculos.comprasTotales)}
            </p>
            <span className="text-[11px] font-bold text-slate-600">
              {calculos.porcentajeComprasArt20.toFixed(1)}% del lím. Cat. K
            </span>
          </div>
        </div>

        {/* Barra de progreso 1: Facturación frente a Categoría Actual */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-petroleo">Tope Categoría {cliente.Categoria_Actual} (c/ IPC)</span>
            <span className="text-slate-700">{formatARS(calculos.topeCat)}</span>
          </div>
          <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                superaVentasCatActual
                  ? 'bg-red-600'
                  : precaucionVentas
                    ? 'bg-amber-500'
                    : 'bg-petroleo'
              }`}
              style={{ width: `${Math.min(100, calculos.porcentaje)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-semibold">
            <span>Consumido: {calculos.porcentaje.toFixed(1)}%</span>
            <span>
              {superaVentasCatActual
                ? `Exceso: ${formatARS(calculos.excesoCategoria)}`
                : `Margen: ${formatARS(calculos.margenDisponible)}`}
            </span>
          </div>
        </div>

        {/* Barra de progreso 2: Facturación frente a Categoría K (Tope Máximo) */}
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-700">Progreso frente a Categoría K (Tope Máximo)</span>
            <span className="text-slate-700">{formatARS(TOPE_MAXIMO_ANUAL)}</span>
          </div>
          <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                calculos.superaMaximoMonotributo ? 'bg-red-600' : 'bg-petroleo-light'
              }`}
              style={{ width: `${Math.min(100, calculos.porcentajeSobreCatK)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-semibold">
            <span>{calculos.porcentajeSobreCatK.toFixed(1)}% del máximo Monotributo</span>
            <span>Margen hasta K: {formatARS(calculos.margenHastaCatK)}</span>
          </div>
        </div>
      </section>

      {/* 2. REGLA DE EXCLUSIÓN ART. 20 (EXACTA SOBRE CATEGORÍA K) */}
      <section
        className={`bg-white rounded-3xl shadow-sm p-4 sm:p-5 space-y-3.5 border ${
          calculos.alertaExclusionGastos
            ? 'border-red-400 ring-2 ring-red-500/20'
            : calculos.alertaPrecaucionGastos
              ? 'border-amber-400'
              : 'border-slate-200/80'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-ladrillo inline-flex items-center gap-1">
              <ShoppingBag className="w-3.5 h-3.5" />
              Regla de Exclusión Art. 20
            </span>
            <h3 className="text-sm sm:text-base font-black text-petroleo mt-0.5">
              Tope Compras y Gastos: {calculos.porcLimiteTexto} sobre Categoría K
            </h3>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-black border shrink-0 ${
              calculos.alertaExclusionGastos
                ? 'bg-red-100 text-red-800 border-red-300'
                : calculos.alertaPrecaucionGastos
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}
          >
            {calculos.porcentajeComprasArt20.toFixed(1)}%
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Para <strong>{cliente.Actividad}</strong> el tope de compras/gastos inherentes a la actividad se calcula{' '}
          <strong>siempre sobre el tope anual de Categoría K</strong> ({formatARS(TOPE_CATEGORIA_K_VIGENTE)}):{' '}
          <strong className="text-petroleo">{formatARS(calculos.limiteComprasArt20CatK)}</strong> ({calculos.porcLimiteTexto}).
          Alerta preventiva al <strong>75%</strong> y crítica al <strong>100%</strong>.
        </p>

        {/* Barra Art. 20 con marcador al 75% */}
        <div className="bg-[#F8FAFC] p-3.5 rounded-2xl border border-slate-200 space-y-2">
          <div className="relative pt-5 pb-1">
            <div
              className="absolute top-0 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ left: '75%' }}
            >
              <span className="bg-amber-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                ALERTA 75%
              </span>
            </div>
            <div className="w-full h-6 bg-petroleo/10 rounded-xl overflow-hidden relative border border-petroleo/25">
              <div
                className={`h-full transition-all duration-500 flex items-center justify-end pr-2 text-[11px] font-black text-white ${
                  calculos.alertaExclusionGastos
                    ? 'bg-red-600'
                    : calculos.alertaPrecaucionGastos
                      ? 'bg-amber-500'
                      : 'bg-ladrillo'
                }`}
                style={{ width: `${Math.min(100, calculos.porcentajeComprasArt20)}%` }}
              >
                {calculos.porcentajeComprasArt20 >= 12 && `${calculos.porcentajeComprasArt20.toFixed(1)}%`}
              </div>
            </div>
            <div className="absolute top-4 bottom-0 w-0.5 bg-amber-500 z-10" style={{ left: '75%' }} />
          </div>

          <div className="flex justify-between text-[11px] font-bold">
            <span className="text-ladrillo">Acumulado: {formatARS(calculos.comprasTotales)}</span>
            <span className={calculos.alertaExclusionGastos ? 'text-red-700' : 'text-emerald-800'}>
              {calculos.alertaExclusionGastos
                ? `Excedente: ${formatARS(calculos.excesoGastosArt20)}`
                : `Margen: ${formatARS(calculos.margenGastosDisponible)}`}
            </span>
          </div>
        </div>
      </section>

      {/* 3. SIMULADOR INTERACTIVO EN VIVO */}
      <section className="bg-gradient-to-br from-petroleo to-petroleo-dark text-white rounded-3xl p-4 sm:p-5 shadow-md border-2 border-ladrillo space-y-4">
        <div className="flex items-start justify-between gap-2 border-b border-white/15 pb-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider bg-ladrillo text-white px-2.5 py-1 rounded-full">
              <Calculator className="w-3.5 h-3.5" />
              Simulador Interactivo
            </span>
            <h3 className="text-base font-black mt-1.5 leading-tight">
              Proyectá facturación y gastos extra
            </h3>
          </div>

          {haySimulacion && (
            <button
              type="button"
              onClick={() => {
                setMontoSimuladoVentas(0);
                setMontoSimuladoCompras(0);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-white/15 hover:bg-white/25 text-hueso px-3 py-2 rounded-xl border border-white/20 shrink-0 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restablecer</span>
            </button>
          )}
        </div>

        {/* + Facturación ($) */}
        <div className="bg-white/10 rounded-2xl p-3.5 border border-white/15 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-extrabold uppercase text-hueso">
              + Facturación ($)
            </label>
            <div className="flex items-center gap-1.5">
              {[500000, 2000000, 5000000].map((monto) => (
                <button
                  key={`v-${monto}`}
                  type="button"
                  onClick={() => setMontoSimuladoVentas((prev) => parseMontoSeguro(prev) + monto)}
                  className="text-[11px] font-extrabold bg-white/15 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg border border-white/20 transition"
                >
                  +{monto >= 1000000 ? `${monto / 1000000}M` : '500k'}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-petroleo font-black text-sm">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatearInputMiles(montoSimuladoVentas)}
              onChange={(e) => setMontoSimuladoVentas(parseInputSimulador(e.target.value))}
              placeholder="0 (Ej: 2.000.000)"
              className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white text-petroleo font-black text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <input
            type="range"
            min="0"
            max={Math.max(20000000, Math.round(calculos.topeCat * 1.2))}
            step="100000"
            value={montoSimuladoVentas}
            onChange={(e) => setMontoSimuladoVentas(parseMontoSeguro(e.target.value))}
            className="w-full h-2 bg-white/30 rounded-lg cursor-pointer"
          />
        </div>

        {/* + Gastos ($) */}
        <div className="bg-white/10 rounded-2xl p-3.5 border border-ladrillo/60 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-extrabold uppercase text-hueso">
              + Gastos / Compras ($)
            </label>
            <div className="flex items-center gap-1.5">
              {[500000, 2000000, 5000000].map((monto) => (
                <button
                  key={`c-${monto}`}
                  type="button"
                  onClick={() => setMontoSimuladoCompras((prev) => parseMontoSeguro(prev) + monto)}
                  className="text-[11px] font-extrabold bg-ladrillo/80 hover:bg-ladrillo text-white px-2.5 py-1 rounded-lg border border-white/20 transition"
                >
                  +{monto >= 1000000 ? `${monto / 1000000}M` : '500k'}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ladrillo font-black text-sm">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatearInputMiles(montoSimuladoCompras)}
              onChange={(e) => setMontoSimuladoCompras(parseInputSimulador(e.target.value))}
              placeholder="0 (Ej: 1.500.000)"
              className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white text-ladrillo font-black text-sm focus:outline-none focus:ring-2 focus:ring-ladrillo"
            />
          </div>

          <input
            type="range"
            min="0"
            max={Math.max(55000000, Math.round(calculos.limiteComprasArt20CatK * 1.15))}
            step="500000"
            value={montoSimuladoCompras}
            onChange={(e) => setMontoSimuladoCompras(parseMontoSeguro(e.target.value))}
            className="w-full h-2 bg-white/30 rounded-lg cursor-pointer"
          />
        </div>

        {/* Resultado en vivo del Simulador */}
        <div className="bg-slate-950/45 rounded-2xl p-3.5 border border-white/15 space-y-3">
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className={`rounded-xl p-2.5 ${esExclusion ? 'bg-red-600/35 border border-red-400/60' : 'bg-white/10'}`}>
              <span className="text-[10px] uppercase font-bold text-hueso/80 block">Categoría estimada</span>
              <strong className={`text-sm sm:text-base font-black leading-snug block mt-0.5 ${esExclusion ? 'text-red-200' : 'text-white'}`}>
                {calculos.categoriaProyectada.length === 1
                  ? `Cat. ${calculos.categoriaProyectada}`
                  : calculos.categoriaProyectada}
              </strong>
            </div>

            <div className={`rounded-xl p-2.5 ${esExclusion ? 'bg-red-600/35 border border-red-400/60' : 'bg-white/10'}`}>
              <span className="text-[10px] uppercase font-bold text-hueso/80 block">Nueva cuota mensual</span>
              {esExclusion ? (
                <div className="mt-0.5">
                  <strong className="text-sm sm:text-base font-black text-red-200 leading-tight block">
                    Pasa a Resp. Inscripto
                  </strong>
                  <span className="text-[10px] text-hueso/90 font-semibold leading-tight block mt-0.5">
                    IVA + Ganancias + Autónomos — Consultar estudio
                  </span>
                </div>
              ) : (
                <strong className="text-base font-black text-emerald-300 block mt-0.5">
                  {calculos.cuotaProyectada !== null ? formatARS(calculos.cuotaProyectada) : 'Consultar estudio'}
                </strong>
              )}
            </div>
          </div>

          {/* Motivo exacto ante Exclusión o Alerta Crítica */}
          {motivoCriticoSimulador && (
            <div className="rounded-xl bg-red-600/90 border border-red-300/70 px-3 py-2.5 text-xs font-extrabold text-white flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-hueso shrink-0 mt-0.5" />
              <span className="leading-snug">{motivoCriticoSimulador}</span>
            </div>
          )}

          {/* Márgenes separados: Ventas y Gastos Art. 20 */}
          <div className="space-y-1.5 text-[11px] px-1 pt-0.5">
            <div className="flex items-center justify-between gap-2 text-hueso">
              <span>{superaVentasCatActual ? `Exceso de ventas Cat. ${cliente.Categoria_Actual}:` : 'Margen ventas restante:'}</span>
              <strong className={superaVentasCatActual ? 'text-red-300 font-black' : 'text-white'}>
                {superaVentasCatActual ? `-${formatARS(calculos.excesoCategoria)}` : formatARS(calculos.margenDisponible)}
              </strong>
            </div>

            <div className="flex items-center justify-between gap-2 text-hueso">
              <span>
                {calculos.alertaExclusionGastos
                  ? 'Exceso de gastos Art. 20:'
                  : 'Margen gastos restante (Art. 20):'}
              </span>
              <strong
                className={
                  calculos.alertaExclusionGastos
                    ? 'text-red-300 font-black bg-red-950/70 px-2 py-0.5 rounded-md border border-red-400/50'
                    : calculos.alertaPrecaucionGastos
                      ? 'text-amber-300 font-black'
                      : 'text-emerald-300 font-black'
                }
              >
                {calculos.alertaExclusionGastos
                  ? `-${formatARS(calculos.excesoGastosArt20)}`
                  : formatARS(calculos.margenGastosDisponible)}
              </strong>
            </div>
          </div>

          <button
            type="button"
            disabled={!haySimulacion}
            onClick={() => {
              setMontoSimuladoVentas(0);
              setMontoSimuladoCompras(0);
            }}
            className="w-full py-2.5 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-40 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer a mis datos reales</span>
          </button>
        </div>
      </section>

      {/* 4. SEMÁFORO DE MONOTRIBUTO — DOS INDICADORES CLARAMENTE SEPARADOS */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase text-ladrillo inline-flex items-center gap-1">
              <PieChart className="w-3.5 h-3.5" />
              Semáforo de Monotributo
            </span>
            <h3 className="text-sm sm:text-base font-black text-petroleo">
              Control independiente: Ventas vs. Gastos Art. 20
            </h3>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-xl shrink-0">
            <span className={`w-3 h-3 rounded-full ${calculos.estado === 'VERDE' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-emerald-950 opacity-40'}`} />
            <span className={`w-3 h-3 rounded-full ${calculos.estado === 'AMARILLO' ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]' : 'bg-amber-950 opacity-40'}`} />
            <span className={`w-3 h-3 rounded-full ${calculos.estado === 'ROJO' ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-red-950 opacity-40'}`} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-stretch">
          {/* INDICADOR 1: VENTAS / INGRESOS (CAT. ACTUAL) */}
          <div
            className={`flex flex-col h-full rounded-2xl p-3.5 border gap-2.5 ${
              superaVentasCatActual
                ? 'bg-red-50/40 border-red-200'
                : precaucionVentas
                  ? 'bg-amber-50/40 border-amber-200'
                  : 'bg-[#F8FAFC] border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2 sm:min-h-[68px]">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-petroleo block">
                  INDICADOR 1 · VENTAS
                </span>
                <h4 className="text-sm font-black text-slate-900 leading-snug mt-0.5">
                  Ingresos (Cat. {cliente.Categoria_Actual})
                </h4>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${badgeVentas.cls}`}>
                {badgeVentas.texto}
              </span>
            </div>

            <DoughnutMedidorIndividual
              porcentaje={calculos.porcentaje}
              colorHex={colorVentasHex}
              etiquetaCentro={`Ventas Cat. ${cliente.Categoria_Actual}`}
              subetiquetaCentro="Tope c/ IPC"
              labelConsumido="% Ventas Cat. actual"
              labelRestante="% Margen ventas"
            />

            <div className="mt-auto space-y-1.5 text-[11px] bg-white rounded-xl p-2.5 border border-slate-200/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-semibold truncate">Facturado 12m:</span>
                <strong className="text-petroleo font-black whitespace-nowrap tabular-nums shrink-0">
                  {formatARS(calculos.ventasTotales)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-semibold truncate">Tope Cat. {cliente.Categoria_Actual}:</span>
                <strong className="text-slate-800 whitespace-nowrap tabular-nums shrink-0">
                  {formatARS(calculos.topeCat)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <span className="font-bold text-slate-700 truncate">
                  {superaVentasCatActual ? 'Excedente:' : 'Margen ventas:'}
                </span>
                <strong
                  className={`whitespace-nowrap tabular-nums shrink-0 ${
                    superaVentasCatActual ? 'text-red-700 font-black' : 'text-emerald-700 font-black'
                  }`}
                >
                  {superaVentasCatActual
                    ? `-${formatARS(calculos.excesoCategoria)}`
                    : formatARS(calculos.margenDisponible)}
                </strong>
              </div>
            </div>
          </div>

          {/* INDICADOR 2: COMPRAS Y GASTOS (CONTROL ART. 20 s/ CAT. K) */}
          <div
            className={`flex flex-col h-full rounded-2xl p-3.5 border gap-2.5 ${
              calculos.alertaExclusionGastos
                ? 'bg-red-50/60 border-red-300'
                : calculos.alertaPrecaucionGastos
                  ? 'bg-amber-50/50 border-amber-300'
                  : 'bg-[#F8FAFC] border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2 sm:min-h-[68px]">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-ladrillo block">
                  INDICADOR 2 · ART. 20
                </span>
                <h4 className="text-sm font-black text-slate-900 leading-snug mt-0.5">
                  Gastos ({calculos.porcLimiteTexto} Cat. K)
                </h4>
                <span className="text-[10px] font-semibold text-slate-500 block">
                  {calculos.esVentaBienes ? 'Venta de Bienes' : 'Servicios'}
                </span>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${badgeGastos.cls}`}>
                {badgeGastos.texto}
              </span>
            </div>

            <DoughnutMedidorIndividual
              porcentaje={calculos.porcentajeComprasArt20}
              colorHex={colorGastosHex}
              etiquetaCentro={`Art. 20 (${calculos.porcLimiteTexto})`}
              subetiquetaCentro={calculos.esVentaBienes ? 'Cat. K · Bienes' : 'Cat. K · Servicios'}
              labelConsumido="% Gastos s/ Cat. K"
              labelRestante="% Margen gastos"
            />

            <div className="mt-auto space-y-1.5 text-[11px] bg-white rounded-xl p-2.5 border border-slate-200/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-semibold truncate">Gastos totales:</span>
                <strong className="text-ladrillo font-black whitespace-nowrap tabular-nums shrink-0">
                  {formatARS(calculos.comprasTotales)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-semibold truncate">Tope {calculos.porcLimiteTexto} Cat. K:</span>
                <strong className="text-slate-800 whitespace-nowrap tabular-nums shrink-0">
                  {formatARS(calculos.limiteComprasArt20CatK)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <span
                  className={`font-bold truncate ${
                    calculos.alertaExclusionGastos ? 'text-red-700' : 'text-slate-700'
                  }`}
                >
                  {calculos.alertaExclusionGastos ? 'Excedente:' : 'Margen disponible:'}
                </span>
                <strong
                  className={`whitespace-nowrap tabular-nums shrink-0 ${
                    calculos.alertaExclusionGastos
                      ? 'text-red-700 font-black bg-red-100 px-1.5 py-0.5 rounded'
                      : 'text-emerald-700 font-black'
                  }`}
                >
                  {calculos.alertaExclusionGastos
                    ? `-${formatARS(calculos.excesoGastosArt20)}`
                    : formatARS(calculos.margenGastosDisponible)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. GRÁFICO DE BARRAS COMPARATIVO */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-ladrillo inline-flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" />
            Comparativa Anual
          </span>
          <h3 className="text-sm font-black text-petroleo">
            Ventas vs. Compras y Límite {calculos.porcLimiteTexto} (Cat. K)
          </h3>
        </div>

        <BarComparativaChart
          ventasTotales={calculos.ventasTotales}
          comprasTotales={calculos.comprasTotales}
          limiteComprasAnual={calculos.limiteComprasArt20CatK}
          porcLimiteTexto={calculos.porcLimiteTexto}
        />
      </section>

      {/* 6. RECOMENDACIONES DEL ESTUDIO */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-petroleo">
          Recomendaciones de GR Estudio
        </h3>
        <ul className="space-y-2">
          {calculos.recomendaciones.map((rec, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 bg-[#F8FAFC] p-3 rounded-2xl border border-slate-200/80 text-xs text-slate-700 font-medium leading-relaxed"
            >
              <CheckCircle2 className="w-4 h-4 text-petroleo shrink-0 mt-0.5" />
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
