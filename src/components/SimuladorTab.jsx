import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  FlaskConical,
  PieChart,
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
  calcularEstadoMonotributo,
  formatARS,
  formatearInputMiles,
  parseInputSimulador,
  parseMontoSeguro
} from '../utils/fiscalCalculations.js';
import { BarComparativaChart, DoughnutMedidorIndividual } from './ChartsMonotributo.jsx';

/**
 * 5.ª PESTAÑA: SIMULADOR DE MONOTRIBUTO (ESTADO 100% AISLADO)
 * Las proyecciones ingresadas aquí viven únicamente en estado local y NUNCA
 * modifican ni contaminan los datos reales ni el semáforo de Inicio.
 */
export default function SimuladorTab({ cliente }) {
  const [montoSimuladoVentas, setMontoSimuladoVentas] = useState(0);
  const [montoSimuladoCompras, setMontoSimuladoCompras] = useState(0);

  // Referencia 100% real (solo lectura)
  const baseReal = useMemo(() => calcularEstadoMonotributo(cliente, 0, 0), [cliente]);

  // Cálculo proyectado estrictamente local al Simulador
  const simulacion = useMemo(
    () => calcularEstadoMonotributo(cliente, montoSimuladoVentas, montoSimuladoCompras),
    [cliente, montoSimuladoVentas, montoSimuladoCompras]
  );

  const haySimulacion = montoSimuladoVentas > 0 || montoSimuladoCompras > 0;

  // Estados y colores independientes para los dos medidores proyectados
  const superaVentasCatActual = simulacion.ventasTotales > simulacion.topeCat;
  const precaucionVentas = !superaVentasCatActual && simulacion.porcentaje >= 80;
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

  const colorGastosHex = simulacion.alertaExclusionGastos
    ? '#dc2626'
    : simulacion.alertaPrecaucionGastos
      ? '#d97706'
      : '#16a34a';
  const badgeGastos = simulacion.alertaExclusionGastos
    ? { texto: 'Exclusión Art. 20', cls: 'bg-red-100 text-red-800 border-red-200' }
    : simulacion.alertaPrecaucionGastos
      ? { texto: 'Alerta ≥75%', cls: 'bg-amber-100 text-amber-900 border-amber-200' }
      : { texto: 'Dentro del tope', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };

  const esExclusion =
    simulacion.alertaExclusionGastos ||
    simulacion.superaMaximoMonotributo ||
    String(simulacion.categoriaProyectada || '').toUpperCase().includes('EXCLUSIÓN');

  let motivoCriticoSimulador = '';
  if (simulacion.alertaExclusionGastos && simulacion.superaMaximoMonotributo) {
    motivoCriticoSimulador = 'Motivo: Supera ambos topes (Ventas y Gastos Art. 20)';
  } else if (simulacion.alertaExclusionGastos) {
    motivoCriticoSimulador = `Motivo: Gastos/Compras superan el ${simulacion.porcLimiteTexto} del tope de Categoría K (Art. 20)`;
  } else if (simulacion.superaMaximoMonotributo) {
    motivoCriticoSimulador = 'Motivo: Ventas superan el tope máximo de Categoría K';
  } else if (superaVentasCatActual) {
    motivoCriticoSimulador = `Motivo: Ventas superan el tope de Categoría ${cliente.Categoria_Actual} — Corresponde recategorizar a Cat. ${simulacion.categoriaProyectadaVentas}`;
  }

  return (
    <div className="space-y-4">
      {/* ENCABEZADO DEL SIMULADOR + AVISO ENTORNO DE PRUEBA */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider bg-hueso text-petroleo border border-hueso-border px-2.5 py-0.5 rounded-full">
              <FlaskConical className="w-3 h-3 text-ladrillo" />
              Entorno de prueba • Escalas IPC {FACTOR_IPC}
            </span>
            <h2 className="text-lg sm:text-xl font-black text-petroleo leading-tight mt-1.5">
              Simulador de Monotributo
            </h2>
          </div>
          <span className="text-[11px] font-extrabold bg-petroleo-50 text-petroleo border border-petroleo/20 px-2.5 py-1 rounded-xl shrink-0">
            Cat. {cliente.Categoria_Actual}
          </span>
        </div>

        <p className="text-xs font-semibold text-slate-700 bg-hueso/75 border border-hueso-border rounded-2xl p-3 leading-relaxed">
          Entorno de prueba: las proyecciones que cargues acá no modifican tus datos reales ni tu estado ante ARCA.
        </p>

        {/* MINI REFERENCIA DE SOLO LECTURA CON LA BASE REAL DEL CLIENTE */}
        <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              Tu base real registrada (Últimos 12 meses — solo lectura)
            </span>
            <span className="text-[10px] font-bold text-petroleo">{cliente.Actividad}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white rounded-xl p-2.5 border border-slate-200/80">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                Facturación real 12M
              </span>
              <strong className="text-sm font-black text-petroleo whitespace-nowrap tabular-nums">
                {formatARS(baseReal.ventasBase)}
              </strong>
            </div>
            <div className="bg-white rounded-xl p-2.5 border border-slate-200/80">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                Compras / Gastos 12M
              </span>
              <strong className="text-sm font-black text-ladrillo whitespace-nowrap tabular-nums">
                {formatARS(baseReal.comprasBase)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* CONTROLES INTERACTIVOS + RESULTADO PROYECTADO */}
      <section className="bg-gradient-to-br from-petroleo to-petroleo-dark text-white rounded-3xl p-4 sm:p-5 shadow-md border-2 border-ladrillo space-y-4">
        <div className="flex items-start justify-between gap-2 border-b border-white/15 pb-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider bg-ladrillo text-white px-2.5 py-1 rounded-full">
              <Calculator className="w-3.5 h-3.5" />
              Proyección simulada
            </span>
            <h3 className="text-base font-black mt-1.5 leading-tight">
              ¿Qué pasa si facturo o gasto un monto extra?
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
            max={Math.max(20000000, Math.round(baseReal.topeCat * 1.2))}
            step="100000"
            value={montoSimuladoVentas}
            onChange={(e) => setMontoSimuladoVentas(parseMontoSeguro(e.target.value))}
            className="w-full h-2 bg-white/30 rounded-lg cursor-pointer"
          />
        </div>

        {/* + Gastos / Compras ($) */}
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
            max={Math.max(55000000, Math.round(baseReal.limiteComprasArt20CatK * 1.15))}
            step="500000"
            value={montoSimuladoCompras}
            onChange={(e) => setMontoSimuladoCompras(parseMontoSeguro(e.target.value))}
            className="w-full h-2 bg-white/30 rounded-lg cursor-pointer"
          />
        </div>

        {/* RESULTADO PROYECTADO EN VIVO */}
        <div className="bg-slate-950/45 rounded-2xl p-3.5 border border-white/15 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-hueso">
              {haySimulacion ? 'Resultado — Proyección simulada' : 'Resultado — Base actual (sin extras)'}
            </span>
            {haySimulacion && (
              <span className="text-[10px] font-black bg-ladrillo text-white px-2 py-0.5 rounded-full">
                Simulación activa
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className={`rounded-xl p-2.5 ${esExclusion ? 'bg-red-600/35 border border-red-400/60' : 'bg-white/10'}`}>
              <span className="text-[10px] uppercase font-bold text-hueso/80 block">Categoría estimada</span>
              <strong className={`text-sm sm:text-base font-black leading-snug block mt-0.5 ${esExclusion ? 'text-red-200' : 'text-white'}`}>
                {simulacion.categoriaProyectada.length === 1
                  ? `Cat. ${simulacion.categoriaProyectada}`
                  : simulacion.categoriaProyectada}
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
                <strong className="text-base font-black text-emerald-300 block mt-0.5 whitespace-nowrap tabular-nums">
                  {simulacion.cuotaProyectada !== null ? formatARS(simulacion.cuotaProyectada) : 'Consultar estudio'}
                </strong>
              )}
            </div>
          </div>

          {motivoCriticoSimulador && (
            <div className="rounded-xl bg-red-600/90 border border-red-300/70 px-3 py-2.5 text-xs font-extrabold text-white flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-hueso shrink-0 mt-0.5" />
              <span className="leading-snug">{motivoCriticoSimulador}</span>
            </div>
          )}

          <div className="space-y-1.5 text-[11px] px-1 pt-0.5">
            <div className="flex items-center justify-between gap-2 text-hueso">
              <span>{superaVentasCatActual ? `Exceso de ventas Cat. ${cliente.Categoria_Actual}:` : 'Margen ventas restante:'}</span>
              <strong className={`whitespace-nowrap tabular-nums ${superaVentasCatActual ? 'text-red-300 font-black' : 'text-white'}`}>
                {superaVentasCatActual ? `-${formatARS(simulacion.excesoCategoria)}` : formatARS(simulacion.margenDisponible)}
              </strong>
            </div>

            <div className="flex items-center justify-between gap-2 text-hueso">
              <span>
                {simulacion.alertaExclusionGastos
                  ? 'Exceso de gastos Art. 20:'
                  : 'Margen gastos restante (Art. 20):'}
              </span>
              <strong
                className={`whitespace-nowrap tabular-nums ${
                  simulacion.alertaExclusionGastos
                    ? 'text-red-300 font-black bg-red-950/70 px-2 py-0.5 rounded-md border border-red-400/50'
                    : simulacion.alertaPrecaucionGastos
                      ? 'text-amber-300 font-black'
                      : 'text-emerald-300 font-black'
                }`}
              >
                {simulacion.alertaExclusionGastos
                  ? `-${formatARS(simulacion.excesoGastosArt20)}`
                  : formatARS(simulacion.margenGastosDisponible)}
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

      {/* ALERTAS PROYECTADAS DEL SIMULADOR */}
      {simulacion.alertaExclusionGastos && (
        <div className="bg-red-600 text-white rounded-3xl p-4 shadow-md border-2 border-red-300 space-y-1.5">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-hueso shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="text-[10px] font-black uppercase tracking-wider bg-red-900/70 px-2 py-0.5 rounded text-hueso">
                Proyección simulada • Exclusión Art. 20 ({simulacion.porcentajeComprasArt20.toFixed(1)}%)
              </span>
              <p className="font-extrabold mt-1 leading-snug">
                Con este escenario simulado superarías en {formatARS(simulacion.excesoGastosArt20)} el tope del{' '}
                {simulacion.porcLimiteTexto} sobre Categoría K ({formatARS(simulacion.limiteComprasArt20CatK)}).
              </p>
            </div>
          </div>
        </div>
      )}

      {simulacion.alertaPrecaucionGastos && (
        <div className="bg-amber-50 border-2 border-amber-400 text-amber-950 rounded-3xl p-4 flex items-start gap-2.5 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase text-amber-800">
              Proyección simulada • Alerta Preventiva Art. 20 (≥ 75%)
            </p>
            <p className="font-semibold mt-0.5 leading-snug">
              En este escenario alcanzarías el <strong>{simulacion.porcentajeComprasArt20.toFixed(1)}%</strong> del tope anual de compras sobre Categoría K.
            </p>
          </div>
        </div>
      )}

      {/* BARRAS PROYECTADAS (ETIQUETADAS COMO PROYECCIÓN SIMULADA) */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-ladrillo">
              Proyección simulada
            </span>
            <h3 className="text-sm sm:text-base font-black text-petroleo">
              Barras de progreso proyectadas
            </h3>
          </div>
          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${simulacion.bgBadge}`}>
            {simulacion.tituloEstado}
          </span>
        </div>

        {/* Barra 1: Ventas vs Categoría actual */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold gap-2">
            <span className="text-petroleo">Ventas proyectadas vs. Cat. {cliente.Categoria_Actual}</span>
            <span className="text-slate-700 whitespace-nowrap tabular-nums">{formatARS(simulacion.topeCat)}</span>
          </div>
          <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                superaVentasCatActual ? 'bg-red-600' : precaucionVentas ? 'bg-amber-500' : 'bg-petroleo'
              }`}
              style={{ width: `${Math.min(100, simulacion.porcentaje)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-semibold">
            <span>Proyectado: {simulacion.porcentaje.toFixed(1)}%</span>
            <span className="whitespace-nowrap tabular-nums">Total: {formatARS(simulacion.ventasTotales)}</span>
          </div>
        </div>

        {/* Barra 2: Ventas vs Categoría K */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs font-bold gap-2">
            <span className="text-slate-700">Ventas proyectadas vs. Categoría K</span>
            <span className="text-slate-700 whitespace-nowrap tabular-nums">{formatARS(TOPE_MAXIMO_ANUAL)}</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                simulacion.superaMaximoMonotributo ? 'bg-red-600' : 'bg-petroleo-light'
              }`}
              style={{ width: `${Math.min(100, simulacion.porcentajeSobreCatK)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-semibold">
            <span>{simulacion.porcentajeSobreCatK.toFixed(1)}% del máximo Monotributo</span>
            <span className="whitespace-nowrap tabular-nums">Margen K: {formatARS(simulacion.margenHastaCatK)}</span>
          </div>
        </div>

        {/* Barra 3: Art. 20 sobre Cat. K */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs font-bold gap-2">
            <span className="text-ladrillo inline-flex items-center gap-1">
              <ShoppingBag className="w-3.5 h-3.5" />
              Gastos Art. 20 ({simulacion.porcLimiteTexto} s/ Cat. K)
            </span>
            <span className="text-slate-700 whitespace-nowrap tabular-nums">
              {formatARS(simulacion.limiteComprasArt20CatK)}
            </span>
          </div>
          <div className="relative pt-4 pb-1">
            <div
              className="absolute top-0 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ left: '75%' }}
            >
              <span className="bg-amber-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                75%
              </span>
            </div>
            <div className="w-full h-5 bg-petroleo/10 rounded-xl overflow-hidden relative border border-petroleo/25">
              <div
                className={`h-full transition-all duration-500 flex items-center justify-end pr-2 text-[10px] font-black text-white ${
                  simulacion.alertaExclusionGastos
                    ? 'bg-red-600'
                    : simulacion.alertaPrecaucionGastos
                      ? 'bg-amber-500'
                      : 'bg-ladrillo'
                }`}
                style={{ width: `${Math.min(100, simulacion.porcentajeComprasArt20)}%` }}
              >
                {simulacion.porcentajeComprasArt20 >= 14 && `${simulacion.porcentajeComprasArt20.toFixed(1)}%`}
              </div>
            </div>
            <div className="absolute top-3.5 bottom-0 w-0.5 bg-amber-500 z-10" style={{ left: '75%' }} />
          </div>
          <p className="text-[10px] text-slate-500">
            Base legal Art. 20: {simulacion.porcLimiteTexto} sobre Tope Cat. K vigente ({formatARS(TOPE_CATEGORIA_K_VIGENTE)}).
          </p>
        </div>
      </section>

      {/* MEDIDORES PROYECTADOS INDEPENDIENTES */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase text-ladrillo inline-flex items-center gap-1">
              <PieChart className="w-3.5 h-3.5" />
              Proyección simulada
            </span>
            <h3 className="text-sm sm:text-base font-black text-petroleo">
              Control independiente: Ventas vs. Gastos Art. 20
            </h3>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-xl shrink-0">
            <span className={`w-3 h-3 rounded-full ${simulacion.estado === 'VERDE' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-emerald-950 opacity-40'}`} />
            <span className={`w-3 h-3 rounded-full ${simulacion.estado === 'AMARILLO' ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]' : 'bg-amber-950 opacity-40'}`} />
            <span className={`w-3 h-3 rounded-full ${simulacion.estado === 'ROJO' ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-red-950 opacity-40'}`} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-stretch">
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
              porcentaje={simulacion.porcentaje}
              colorHex={colorVentasHex}
              etiquetaCentro={`Ventas Cat. ${cliente.Categoria_Actual}`}
              subetiquetaCentro="Proyección"
              labelConsumido="% Ventas proyectadas"
              labelRestante="% Margen ventas"
            />

            <div className="mt-auto space-y-1.5 text-[11px] bg-white rounded-xl p-2.5 border border-slate-200/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-semibold truncate">Proyectado 12m:</span>
                <strong className="text-petroleo font-black whitespace-nowrap tabular-nums shrink-0">
                  {formatARS(simulacion.ventasTotales)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-semibold truncate">Tope Cat. {cliente.Categoria_Actual}:</span>
                <strong className="text-slate-800 whitespace-nowrap tabular-nums shrink-0">
                  {formatARS(simulacion.topeCat)}
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
                    ? `-${formatARS(simulacion.excesoCategoria)}`
                    : formatARS(simulacion.margenDisponible)}
                </strong>
              </div>
            </div>
          </div>

          <div
            className={`flex flex-col h-full rounded-2xl p-3.5 border gap-2.5 ${
              simulacion.alertaExclusionGastos
                ? 'bg-red-50/60 border-red-300'
                : simulacion.alertaPrecaucionGastos
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
                  Gastos ({simulacion.porcLimiteTexto} Cat. K)
                </h4>
                <span className="text-[10px] font-semibold text-slate-500 block">
                  {simulacion.esVentaBienes ? 'Venta de Bienes' : 'Servicios'}
                </span>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${badgeGastos.cls}`}>
                {badgeGastos.texto}
              </span>
            </div>

            <DoughnutMedidorIndividual
              porcentaje={simulacion.porcentajeComprasArt20}
              colorHex={colorGastosHex}
              etiquetaCentro={`Art. 20 (${simulacion.porcLimiteTexto})`}
              subetiquetaCentro={simulacion.esVentaBienes ? 'Cat. K · Bienes' : 'Cat. K · Servicios'}
              labelConsumido="% Gastos proyectados"
              labelRestante="% Margen gastos"
            />

            <div className="mt-auto space-y-1.5 text-[11px] bg-white rounded-xl p-2.5 border border-slate-200/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-semibold truncate">Gastos totales:</span>
                <strong className="text-ladrillo font-black whitespace-nowrap tabular-nums shrink-0">
                  {formatARS(simulacion.comprasTotales)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-semibold truncate">Tope {simulacion.porcLimiteTexto} Cat. K:</span>
                <strong className="text-slate-800 whitespace-nowrap tabular-nums shrink-0">
                  {formatARS(simulacion.limiteComprasArt20CatK)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <span
                  className={`font-bold truncate ${
                    simulacion.alertaExclusionGastos ? 'text-red-700' : 'text-slate-700'
                  }`}
                >
                  {simulacion.alertaExclusionGastos ? 'Excedente:' : 'Margen disponible:'}
                </span>
                <strong
                  className={`whitespace-nowrap tabular-nums shrink-0 ${
                    simulacion.alertaExclusionGastos
                      ? 'text-red-700 font-black bg-red-100 px-1.5 py-0.5 rounded'
                      : 'text-emerald-700 font-black'
                  }`}
                >
                  {simulacion.alertaExclusionGastos
                    ? `-${formatARS(simulacion.excesoGastosArt20)}`
                    : formatARS(simulacion.margenGastosDisponible)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GRÁFICO COMPARATIVO PROYECTADO */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-ladrillo inline-flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" />
            Proyección simulada
          </span>
          <h3 className="text-sm font-black text-petroleo">
            Comparativa proyectada y Límite {simulacion.porcLimiteTexto} (Cat. K)
          </h3>
        </div>

        <BarComparativaChart
          ventasTotales={simulacion.ventasTotales}
          comprasTotales={simulacion.comprasTotales}
          limiteComprasAnual={simulacion.limiteComprasArt20CatK}
          porcLimiteTexto={simulacion.porcLimiteTexto}
        />
      </section>
    </div>
  );
}
