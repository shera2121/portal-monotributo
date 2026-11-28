import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightCircle,
  CheckCircle2,
  Download,
  FileText,
  Palette,
  Plus,
  Share2,
  Trash2
} from 'lucide-react';
import { compartirDocumento, descargarBlob } from '../utils/documentHelpers.js';
import { formatARS, formatFechaAR, getHoyISO, parseMontoSeguro } from '../utils/fiscalCalculations.js';
import {
  consumirSiguienteNumeroPresupuesto,
  eliminarPresupuestoCliente,
  guardarPresupuestoCliente,
  leerPresupuestosCliente,
  previsualizarSiguienteNumeroPresupuesto
} from '../utils/marcaDiseno.js';
import { generarComprobantePDF } from '../utils/pdfComprobante.js';

function crearItemVacio() {
  return {
    id: `it-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    descripcion: '',
    cantidad: '1',
    precioUnitario: ''
  };
}

export default function PresupuestosPanel({
  cliente,
  diseno,
  onAbrirDiseno,
  onConvertirAFactura,
  onToast
}) {
  const cuitCliente = cliente?.CUIT || '';

  const [presupuestos, setPresupuestos] = useState(() => leerPresupuestosCliente(cuitCliente));
  const [proximoNumero, setProximoNumero] = useState(() =>
    previsualizarSiguienteNumeroPresupuesto(cuitCliente)
  );

  // Campos del nuevo presupuesto
  const [fecha, setFecha] = useState(getHoyISO());
  const [validezDias, setValidezDias] = useState('15');
  const [receptorNombre, setReceptorNombre] = useState('');
  const [receptorDocumento, setReceptorDocumento] = useState('');
  const [receptorDomicilio, setReceptorDomicilio] = useState('');
  const [items, setItems] = useState(() => [crearItemVacio()]);
  const [observaciones, setObservaciones] = useState(
    'Forma de pago: transferencia bancaria o efectivo. Precios expresados en Pesos Argentinos.'
  );
  const [errorForm, setErrorForm] = useState('');
  const [generando, setGenerando] = useState(false);
  const [ultimoGenerado, setUltimoGenerado] = useState(null); // { presupuesto, blob, filename }

  const itemsCalculados = useMemo(
    () =>
      items.map((it) => {
        const cant = Math.max(0, parseMontoSeguro(it.cantidad, 0));
        const pu = Math.max(0, parseMontoSeguro(it.precioUnitario, 0));
        return {
          ...it,
          cantidadNum: cant,
          precioUnitarioNum: pu,
          subtotal: Math.round(cant * pu * 100) / 100
        };
      }),
    [items]
  );

  const totalGeneral = useMemo(
    () => itemsCalculados.reduce((acc, it) => acc + it.subtotal, 0),
    [itemsCalculados]
  );

  const actualizarItem = (id, campo, valor) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)));
  };

  const agregarItem = () => {
    setItems((prev) => [...prev, crearItemVacio()]);
  };

  const quitarItem = (id) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  };

  const handleGenerarPresupuesto = async (e) => {
    e.preventDefault();
    setErrorForm('');

    if (!receptorNombre.trim()) {
      setErrorForm('Ingresá el nombre o razón social del cliente receptor.');
      return;
    }

    const itemsValidos = itemsCalculados.filter(
      (it) => it.descripcion.trim() && it.cantidadNum > 0 && it.precioUnitarioNum > 0
    );
    if (itemsValidos.length === 0) {
      setErrorForm('Agregá al menos un ítem con descripción, cantidad y precio unitario mayor a $ 0.');
      return;
    }

    setGenerando(true);
    try {
      const numero = consumirSiguienteNumeroPresupuesto(cuitCliente);
      const diasVal = Math.max(1, parseInt(validezDias, 10) || 15);
      const itemsLimpios = itemsValidos.map((it) => ({
        descripcion: it.descripcion.trim(),
        cantidad: it.cantidadNum,
        precioUnitario: it.precioUnitarioNum,
        subtotal: it.subtotal
      }));

      const receptorObj = {
        nombre: receptorNombre.trim(),
        documento: receptorDocumento.trim(),
        domicilio: receptorDomicilio.trim()
      };

      const { blob, filename, total } = await generarComprobantePDF({
        tipo: 'PRESUPUESTO',
        cliente,
        receptor: receptorObj,
        items: itemsLimpios,
        observaciones: observaciones.trim(),
        validezDias: diasVal,
        arcaData: {
          numeroComprobante: numero,
          fecha
        },
        diseno
      });

      const registro = {
        id: `PRES-${Date.now()}`,
        numero,
        fecha,
        validezDias: diasVal,
        receptor: receptorObj,
        items: itemsLimpios,
        observaciones: observaciones.trim(),
        total,
        creadoEn: new Date().toISOString()
      };

      const nuevaLista = guardarPresupuestoCliente(cuitCliente, registro);
      setPresupuestos(nuevaLista);
      setProximoNumero(previsualizarSiguienteNumeroPresupuesto(cuitCliente));
      setUltimoGenerado({ presupuesto: registro, blob, filename });

      // Descargar automáticamente el PDF generado
      descargarBlob(blob, filename);
      onToast?.(`Presupuesto ${numero} generado y descargado en PDF.`);

      // Resetear campos de cliente/ítems para permitir cargar el siguiente
      setReceptorNombre('');
      setReceptorDocumento('');
      setReceptorDomicilio('');
      setItems([crearItemVacio()]);
    } catch (err) {
      setErrorForm(err?.message || 'No se pudo generar el PDF del presupuesto.');
    } finally {
      setGenerando(false);
    }
  };

  const generarPdfDePresupuestoGuardado = async (pres) => {
    return generarComprobantePDF({
      tipo: 'PRESUPUESTO',
      cliente,
      receptor: pres.receptor,
      items: pres.items,
      observaciones: pres.observaciones,
      validezDias: pres.validezDias,
      arcaData: {
        numeroComprobante: pres.numero,
        fecha: pres.fecha
      },
      diseno
    });
  };

  const handleDescargarGuardado = async (pres) => {
    try {
      const { blob, filename } = await generarPdfDePresupuestoGuardado(pres);
      descargarBlob(blob, filename);
      onToast?.(`Presupuesto ${pres.numero} descargado.`);
    } catch (err) {
      onToast?.(err?.message || 'No se pudo generar el PDF.', 'error');
    }
  };

  const handleCompartirWhatsApp = async (pres, blobPreexistente = null, filenamePre = '') => {
    try {
      let blob = blobPreexistente;
      let filename = filenamePre;
      if (!blob) {
        const resPdf = await generarPdfDePresupuestoGuardado(pres);
        blob = resPdf.blob;
        filename = resPdf.filename;
      }

      const res = await compartirDocumento({
        titulo: `Presupuesto ${pres.numero} — ${diseno?.nombreComercial || cliente?.Cliente || ''}`,
        texto: `Te envío el Presupuesto ${pres.numero} por ${formatARS(pres.total)} (validez ${pres.validezDias} días).`,
        blob,
        nombreArchivo: filename || `Presupuesto_${pres.numero}.pdf`
      });

      if (res.shared) {
        onToast?.(
          res.method === 'download-fallback'
            ? 'PDF descargado para que puedas adjuntarlo en WhatsApp.'
            : 'Presupuesto listo para compartir por WhatsApp.'
        );
      }
    } catch (err) {
      onToast?.(err?.message || 'No se pudo compartir el presupuesto.', 'error');
    }
  };

  const handleEliminarGuardado = (id) => {
    const nuevaLista = eliminarPresupuestoCliente(cuitCliente, id);
    setPresupuestos(nuevaLista);
    onToast?.('Presupuesto eliminado del historial local.');
  };

  return (
    <div className="space-y-4">
      {/* Banner de presupuesto recién generado con acceso directo a Compartir por WhatsApp */}
      {ultimoGenerado && (
        <section className="bg-emerald-50 border-2 border-emerald-300 rounded-3xl p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-black text-emerald-950 leading-tight">
                ¡Presupuesto {ultimoGenerado.presupuesto.numero} listo!
              </p>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                {ultimoGenerado.presupuesto.receptor.nombre} •{' '}
                <strong>{formatARS(ultimoGenerado.presupuesto.total)}</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => descargarBlob(ultimoGenerado.blob, ultimoGenerado.filename)}
              className="py-3 px-3 rounded-2xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98]"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Descargar PDF</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleCompartirWhatsApp(
                  ultimoGenerado.presupuesto,
                  ultimoGenerado.blob,
                  ultimoGenerado.filename
                )
              }
              className="py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98]"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>Compartir por WhatsApp</span>
            </button>
          </div>
        </section>
      )}

      {/* Formulario Nuevo Presupuesto */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-base font-black text-petroleo leading-tight">Nuevo Presupuesto PDF</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              N° correlativo: <strong className="font-mono text-petroleo">{proximoNumero}</strong> • Documento no válido como factura
            </p>
          </div>
          <button
            type="button"
            onClick={onAbrirDiseno}
            className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-hueso hover:bg-hueso-border/70 text-petroleo border border-hueso-border px-3 py-1.5 rounded-xl transition"
          >
            <Palette className="w-3.5 h-3.5 text-ladrillo" />
            <span>Mi Marca</span>
          </button>
        </div>

        <form onSubmit={handleGenerarPresupuesto} className="space-y-4">
          {/* Fecha y Validez */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Fecha de emisión
              </label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-xs sm:text-sm font-semibold focus:outline-none focus:border-petroleo"
              />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Validez (días)
              </label>
              <input
                type="number"
                min="1"
                max="180"
                required
                value={validezDias}
                onChange={(e) => setValidezDias(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-xs sm:text-sm font-bold text-petroleo focus:outline-none focus:border-petroleo"
              />
            </div>
          </div>

          {/* Datos del Receptor */}
          <div className="space-y-2.5 p-3.5 rounded-2xl bg-[#F8FAFC] border border-slate-200">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-petroleo block">
              Datos del Cliente Receptor
            </span>
            <input
              type="text"
              required
              value={receptorNombre}
              onChange={(e) => setReceptorNombre(e.target.value)}
              placeholder="Nombre y Apellido o Razón Social *"
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold focus:outline-none focus:border-petroleo"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                inputMode="numeric"
                value={receptorDocumento}
                onChange={(e) => setReceptorDocumento(e.target.value)}
                placeholder="CUIT o DNI (opcional)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
              />
              <input
                type="text"
                value={receptorDomicilio}
                onChange={(e) => setReceptorDomicilio(e.target.value)}
                placeholder="Domicilio (opcional)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
              />
            </div>
          </div>

          {/* Ítems del Presupuesto */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold uppercase tracking-wide text-petroleo">
                Detalle de Ítems *
              </label>
              <button
                type="button"
                onClick={agregarItem}
                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-petroleo bg-petroleo-50 hover:bg-petroleo-100 px-2.5 py-1 rounded-xl transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar ítem</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {itemsCalculados.map((it, idx) => (
                <div
                  key={it.id}
                  className="p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400">
                      Ítem #{idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarItem(it.id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded-lg"
                        aria-label="Quitar ítem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={it.descripcion}
                    onChange={(e) => actualizarItem(it.id, 'descripcion', e.target.value)}
                    placeholder="Descripción del producto o servicio *"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-petroleo"
                  />
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Cant.</label>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        required
                        value={it.cantidad}
                        onChange={(e) => actualizarItem(it.id, 'cantidad', e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-petroleo"
                      />
                    </div>
                    <div className="col-span-5">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                        P. Unitario ($)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        value={it.precioUnitario}
                        onChange={(e) => actualizarItem(it.id, 'precioUnitario', e.target.value)}
                        placeholder="Ej: 85000"
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-petroleo"
                      />
                    </div>
                    <div className="col-span-4 text-right">
                      <span className="block text-[10px] font-bold text-slate-400">Subtotal</span>
                      <strong className="text-xs font-black text-petroleo">
                        {formatARS(it.subtotal)}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total del presupuesto */}
            <div className="bg-petroleo text-white rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-hueso">
                Total Presupuesto
              </span>
              <strong className="text-lg font-black">{formatARS(totalGeneral)}</strong>
            </div>
          </div>

          {/* Observaciones / Condiciones */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Condiciones y Observaciones
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: 50% de seña al confirmar, saldo contra entrega..."
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:border-petroleo resize-none"
            />
          </div>

          {errorForm && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorForm}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={generando}
            className="w-full py-4 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark disabled:opacity-60 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            <FileText className="w-4 h-4" />
            <span>{generando ? 'Generando PDF...' : 'Generar Presupuesto PDF'}</span>
          </button>
        </form>
      </section>

      {/* Historial local de Presupuestos guardados */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-petroleo">Presupuestos Guardados</h3>
            <p className="text-[11px] text-slate-500">
              Historial local en tu dispositivo • Convertí a Factura ARCA en 1 toque
            </p>
          </div>
          <span className="text-[11px] font-extrabold bg-petroleo-50 text-petroleo px-2.5 py-0.5 rounded-full border border-petroleo/15">
            {presupuestos.length}
          </span>
        </div>

        {presupuestos.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-5 bg-[#F8FAFC] rounded-2xl border border-slate-200/70">
            Todavía no generaste presupuestos. Cuando crees uno, quedará guardado acá para reenviar o convertir a Factura.
          </p>
        ) : (
          <div className="space-y-3">
            {presupuestos.map((pres) => (
              <article
                key={pres.id}
                className="rounded-2xl bg-[#F8FAFC] border border-slate-200/80 p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono font-black text-petroleo">
                        {pres.numero}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {formatFechaAR(pres.fecha)}
                      </span>
                      <span className="text-[10px] font-bold bg-hueso text-petroleo px-2 py-0.5 rounded-full">
                        Validez {pres.validezDias} d.
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-900 mt-0.5 truncate">
                      {pres.receptor?.nombre || 'Cliente'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {(pres.items || []).map((i) => i.descripcion).join(' • ')}
                    </p>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <strong className="text-sm font-black text-petroleo">
                      {formatARS(pres.total)}
                    </strong>
                    <button
                      type="button"
                      onClick={() => handleEliminarGuardado(pres.id)}
                      title="Eliminar presupuesto"
                      className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDescargarGuardado(pres)}
                    className="py-2.5 px-3 rounded-xl bg-white hover:bg-petroleo-50 text-petroleo border border-petroleo/25 font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCompartirWhatsApp(pres)}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onConvertirAFactura?.(pres)}
                  className="w-full py-2.5 px-3 rounded-xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.99]"
                >
                  <ArrowRightCircle className="w-4 h-4 text-hueso" />
                  <span>Convertir a Factura</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
