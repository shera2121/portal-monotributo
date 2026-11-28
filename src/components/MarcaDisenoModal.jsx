import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Palette,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import {
  COLORES_MARCA_CLIENTE,
  CONDICIONES_IVA_OPCIONES,
  ESTILOS_PLANTILLA,
  redimensionarLogoCliente
} from '../utils/marcaDiseno.js';

function MiniPreviewComprobante({ diseno, cliente }) {
  const color = diseno.colorPrincipal || '#111827';
  const estilo = diseno.estilo || 'clasico';
  const nombre = diseno.nombreComercial || cliente?.NombreFantasia || cliente?.Cliente || 'Tu Marca';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-inner">
      {/* Decoración superior simulada según estilo */}
      <div className="relative bg-white overflow-hidden">
        {estilo === 'clasico' && <div className="h-2 w-full" style={{ backgroundColor: color }} />}
        {estilo === 'ondas' && (
          <svg viewBox="0 0 300 28" className="w-full h-6 block" preserveAspectRatio="none">
            <path d="M0,18 C80,32 210,0 300,16 L300,0 L0,0 Z" fill={color} fillOpacity="0.22" />
            <path d="M0,12 C90,2 195,24 300,10 L300,0 L0,0 Z" fill={color} />
          </svg>
        )}
        {estilo === 'minimalista' && (
          <div className="px-4 pt-2.5">
            <div className="h-0.5 w-full" style={{ backgroundColor: color }} />
          </div>
        )}
        {estilo === 'dinamico' && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: color }} />
            <svg viewBox="0 0 300 44" className="absolute right-0 top-0 w-36 h-11 pointer-events-none" preserveAspectRatio="none">
              <polygon points="80,0 300,0 300,44" fill={color} fillOpacity="0.16" />
              <polygon points="145,0 300,0 300,32" fill={color} />
            </svg>
          </>
        )}

        {/* Contenido encabezado miniatura */}
        <div className="p-3.5 flex items-start justify-between gap-2 relative z-10">
          <div className="min-w-0 flex-1 space-y-1">
            {diseno.logoDataUrl ? (
              <img
                src={diseno.logoDataUrl}
                alt="Vista previa logotipo"
                className="h-8 max-w-[110px] object-contain"
              />
            ) : (
              <div
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black text-white"
                style={{ backgroundColor: color }}
              >
                SIN LOGO
              </div>
            )}
            <p className="text-xs font-black truncate" style={{ color }}>
              {nombre}
            </p>
            <p className="text-[9px] text-slate-500 truncate">
              {diseno.condicionIva || 'Responsable Monotributo'}
            </p>
          </div>

          {/* Letra central X / C */}
          <div
            className="w-7 h-8 rounded-md flex flex-col items-center justify-center shrink-0 font-black"
            style={
              estilo === 'clasico' || estilo === 'dinamico'
                ? { backgroundColor: color, color: '#FFFFFF' }
                : { border: `1.5px solid ${color}`, color, backgroundColor: `${color}15` }
            }
          >
            <span className="text-xs leading-none">C</span>
            <span className="text-[6px] leading-none mt-0.5">011</span>
          </div>

          {/* Bloque derecho tipo/número */}
          <div className="flex-1 flex justify-end">
            <div
              className="rounded-lg px-2.5 py-1.5 text-right max-w-[110px]"
              style={
                estilo === 'clasico'
                  ? { backgroundColor: color, color: '#FFFFFF' }
                  : estilo === 'ondas'
                    ? { backgroundColor: `${color}18`, color }
                    : { color }
              }
            >
              <p className="text-[9px] font-black leading-tight">PRESUPUESTO</p>
              <p className="text-[8px] font-mono opacity-85">P-0001-00000001</p>
            </div>
          </div>
        </div>

        {/* Mini barra de tabla */}
        <div className="px-3.5 pb-3 space-y-1.5">
          <div
            className="h-4 rounded px-2 flex items-center justify-between text-[7px] font-bold text-white"
            style={{ backgroundColor: estilo === 'minimalista' ? '#1F2937' : color }}
          >
            <span>DESCRIPCIÓN</span>
            <span>SUBTOTAL</span>
          </div>
          <div className="h-2 bg-slate-100 rounded w-full" />
          <div className="h-2 bg-slate-100 rounded w-3/4" />
        </div>

        {/* Decoración inferior simulada */}
        {estilo === 'clasico' && <div className="h-2 w-full" style={{ backgroundColor: color }} />}
        {estilo === 'ondas' && (
          <svg viewBox="0 0 300 20" className="w-full h-4 block" preserveAspectRatio="none">
            <path d="M0,10 C80,0 210,20 300,6 L300,20 L0,20 Z" fill={color} />
          </svg>
        )}
        {estilo === 'minimalista' && (
          <div className="px-4 pb-2 flex items-center gap-1">
            <div className="h-1 w-10 rounded" style={{ backgroundColor: color }} />
            <div className="h-1 w-3 rounded opacity-40" style={{ backgroundColor: color }} />
          </div>
        )}
        {estilo === 'dinamico' && (
          <svg viewBox="0 0 300 18" className="w-full h-4 block" preserveAspectRatio="none">
            <polygon points="0,18 0,4 140,18" fill={color} fillOpacity="0.22" />
            <polygon points="300,18 300,2 120,18" fill={color} />
          </svg>
        )}
      </div>
    </div>
  );
}

export default function MarcaDisenoModal({
  abierto,
  cliente,
  disenoInicial,
  onGuardar,
  onCerrar
}) {
  const inputLogoRef = useRef(null);
  const [borrador, setBorrador] = useState(() => ({ ...disenoInicial }));
  const [procesandoLogo, setProcesandoLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState('');

  if (!abierto) return null;

  const handleSubirLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorLogo('');
    setProcesandoLogo(true);
    try {
      const { dataUrl } = await redimensionarLogoCliente(file, 400);
      setBorrador((prev) => ({ ...prev, logoDataUrl: dataUrl }));
    } catch (err) {
      setErrorLogo(err?.message || 'No se pudo procesar el logotipo.');
    } finally {
      setProcesandoLogo(false);
      if (inputLogoRef.current) inputLogoRef.current.value = '';
    }
  };

  const handleGuardar = (e) => {
    e.preventDefault();
    onGuardar(borrador);
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-20 bg-petroleo text-white px-5 py-4 flex items-center justify-between border-b-4 border-ladrillo">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5 text-hueso" />
            <div>
              <h3 className="text-sm sm:text-base font-black leading-tight">Mi Marca y Diseño</h3>
              <p className="text-[11px] text-petroleo-100">
                Personalizá tus Presupuestos y Facturas ARCA en PDF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-xl hover:bg-white/15 transition"
            aria-label="Cerrar configuración de marca"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleGuardar} className="p-5 space-y-5">
          {/* 1. VISTA PREVIA EN TIEMPO REAL */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-petroleo flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-ladrillo" />
              Vista previa en tiempo real
            </span>
            <MiniPreviewComprobante diseno={borrador} cliente={cliente} />
          </div>

          {/* 2. LOGOTIPO DEL CLIENTE (Canvas max 400px) */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-petroleo uppercase tracking-wide">
              1. Tu Logotipo (PNG / JPG — máx. 400px)
            </label>
            <input
              ref={inputLogoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleSubirLogo}
              className="hidden"
            />
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200">
              {borrador.logoDataUrl ? (
                <img
                  src={borrador.logoDataUrl}
                  alt="Logo cargado"
                  className="w-16 h-12 object-contain rounded-xl bg-white border border-slate-200 p-1 shrink-0"
                />
              ) : (
                <div className="w-16 h-12 rounded-xl bg-white border border-dashed border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                  <ImagePlus className="w-5 h-5" />
                </div>
              )}

              <div className="flex-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={procesandoLogo}
                  onClick={() => inputLogoRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-petroleo hover:bg-petroleo-dark disabled:opacity-60 text-white text-xs font-extrabold transition"
                >
                  {procesandoLogo
                    ? 'Optimizando...'
                    : borrador.logoDataUrl
                      ? 'Cambiar logo'
                      : 'Subir logotipo'}
                </button>
                {borrador.logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setBorrador((prev) => ({ ...prev, logoDataUrl: '' }))}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-extrabold transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Quitar</span>
                  </button>
                )}
              </div>
            </div>
            {errorLogo && (
              <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorLogo}</span>
              </p>
            )}
          </div>

          {/* 3. SELECTOR DE 4 ESTILOS DE PLANTILLA */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-petroleo uppercase tracking-wide">
              2. Estilo de Plantilla
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {ESTILOS_PLANTILLA.map((est) => {
                const activo = borrador.estilo === est.id;
                return (
                  <button
                    key={est.id}
                    type="button"
                    onClick={() => setBorrador((prev) => ({ ...prev, estilo: est.id }))}
                    className={`p-3 rounded-2xl border-2 text-left transition space-y-1 ${
                      activo
                        ? 'border-petroleo bg-petroleo-50/70 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-petroleo/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black text-petroleo">{est.nombre}</span>
                      {activo && <Check className="w-4 h-4 text-petroleo shrink-0" />}
                    </div>
                    <p className="text-[10px] text-slate-600 leading-snug">{est.descripcion}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. COLOR PRINCIPAL DEL CLIENTE (5 predefinidos + libre) */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-petroleo uppercase tracking-wide">
              3. Color Principal de tus Comprobantes
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {COLORES_MARCA_CLIENTE.map((col) => {
                const activo = borrador.colorPrincipal.toLowerCase() === col.hex.toLowerCase();
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setBorrador((prev) => ({ ...prev, colorPrincipal: col.hex }))}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-extrabold transition ${
                      activo
                        ? 'border-petroleo bg-slate-50 text-slate-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                      style={{ backgroundColor: col.hex }}
                    />
                    <span>{col.nombre}</span>
                  </button>
                );
              })}

              {/* Selector libre de color */}
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-slate-200 bg-white hover:border-petroleo/40 text-xs font-extrabold text-slate-700 cursor-pointer transition">
                <input
                  type="color"
                  value={borrador.colorPrincipal}
                  onChange={(e) =>
                    setBorrador((prev) => ({ ...prev, colorPrincipal: e.target.value }))
                  }
                  className="w-5 h-5 rounded border-0 p-0 bg-transparent cursor-pointer"
                />
                <span>Otro color</span>
              </label>
            </div>
          </div>

          {/* 5. DATOS DE ENCABEZADO FISCAL PARA EL PDF */}
          <div className="space-y-2.5 p-3.5 rounded-2xl bg-[#F8FAFC] border border-slate-200">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-petroleo block">
              4. Datos visibles en tus PDFs (opcional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Nombre comercial / Fantasía
                </label>
                <input
                  type="text"
                  value={borrador.nombreComercial || ''}
                  onChange={(e) =>
                    setBorrador((prev) => ({ ...prev, nombreComercial: e.target.value }))
                  }
                  placeholder={cliente?.Cliente || 'Mi Emprendimiento'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-petroleo"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Domicilio comercial
                </label>
                <input
                  type="text"
                  value={borrador.domicilioComercial || ''}
                  onChange={(e) =>
                    setBorrador((prev) => ({ ...prev, domicilioComercial: e.target.value }))
                  }
                  placeholder="Ej: San Martín 315, Salta"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  N° Ingresos Brutos
                </label>
                <input
                  type="text"
                  value={borrador.ingresosBrutos || ''}
                  onChange={(e) =>
                    setBorrador((prev) => ({ ...prev, ingresosBrutos: e.target.value }))
                  }
                  placeholder="Ej: 20345678904"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Inicio de Actividades
                </label>
                <input
                  type="text"
                  value={borrador.inicioActividades || ''}
                  onChange={(e) =>
                    setBorrador((prev) => ({ ...prev, inicioActividades: e.target.value }))
                  }
                  placeholder="Ej: 01/03/2021"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Condición frente al IVA
                </label>
                <select
                  value={borrador.condicionIva || 'Responsable Monotributo'}
                  onChange={(e) =>
                    setBorrador((prev) => ({ ...prev, condicionIva: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-petroleo focus:outline-none focus:border-petroleo"
                >
                  {CONDICIONES_IVA_OPCIONES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={onCerrar}
              className="py-3.5 rounded-2xl border-2 border-slate-200 text-slate-700 font-extrabold text-xs hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="py-3.5 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark text-white font-extrabold text-xs shadow-md transition active:scale-[0.99]"
            >
              Guardar Mi Marca
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
