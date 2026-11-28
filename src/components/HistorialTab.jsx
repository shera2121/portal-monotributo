import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileDown,
  FileText,
  Search,
  Share2,
  X,
  XCircle
} from 'lucide-react';
import {
  formatARS,
  formatFechaAR,
  limpiarFechasLargasEnTexto
} from '../utils/fiscalCalculations.js';
import {
  compartirDocumento,
  descargarBlob,
  generarPdfComprobante,
  generarPdfConstancia
} from '../utils/documentHelpers.js';
import { leerDisenoCliente } from '../utils/marcaDiseno.js';
import { generarComprobantePDF } from '../utils/pdfComprobante.js';

const FILTROS_TIPO_DOCUMENTO = ['Todos', 'VEP', 'Constancia', 'Factura / NC'];

function coincideFiltroTipoDocumento(doc, filtro) {
  if (filtro === 'Todos') return true;
  const textoTipo = `${doc?.tipo || ''} ${doc?.impuesto || ''} ${doc?.detalle || ''}`.toLowerCase();
  if (filtro === 'VEP') {
    return /\bvep\b/.test(textoTipo);
  }
  if (filtro === 'Constancia') {
    return /constancia|inscripci/.test(textoTipo);
  }
  if (filtro === 'Factura / NC') {
    return /factura|nota\s*de\s*cr[eé]dito|nota_credito|\bnc\b|comprobante\s*c/.test(textoTipo);
  }
  return true;
}

export default function HistorialTab({
  cliente,
  ventas = [],
  comprasGastos = [],
  solicitudesDocumentos = [],
  solapaInicial = 'compras',
  solapaNonce = 0,
  onToast
}) {
  const [solapa, setSolapa] = useState(solapaInicial); // 'ventas' | 'compras' | 'documentos'
  const [periodo, setPeriodo] = useState('Todos');
  const [filtroTipoDoc, setFiltroTipoDoc] = useState('Todos');
  const [busqueda, setBusqueda] = useState('');
  const [visorItem, setVisorItem] = useState(null);

  useEffect(() => {
    if (solapaInicial) {
      setSolapa(solapaInicial);
    }
  }, [solapaInicial, solapaNonce]);

  const listaActual = solapa === 'ventas' ? ventas : comprasGastos;

  // Períodos disponibles (YYYY-MM)
  const periodosDisponibles = useMemo(() => {
    const set = new Set();
    [...ventas, ...comprasGastos].forEach((item) => {
      const p = item.periodo || String(item.fecha || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(p)) set.add(p);
    });
    return ['Todos', ...Array.from(set).sort((a, b) => (a < b ? 1 : -1))];
  }, [ventas, comprasGastos]);

  // Filtrado por período + texto/monto (Ventas / Compras y Gastos)
  const filtrados = useMemo(() => {
    if (solapa === 'documentos') return [];
    const q = busqueda.trim().toLowerCase();
    return listaActual.filter((item) => {
      const itemPeriodo = item.periodo || String(item.fecha || '').slice(0, 7);
      if (periodo !== 'Todos' && itemPeriodo !== periodo) return false;
      if (!q) return true;

      const campos = [
        item.tipoComprobante,
        item.numeroComprobante,
        item.cae,
        item.receptorNombre,
        item.receptorDocumento,
        item.descripcion,
        item.proveedor,
        item.clasificacion,
        item.observacion,
        item.estado,
        item.motivoObservacion,
        String(item.importe || ''),
        formatARS(item.importe)
      ]
        .join(' ')
        .toLowerCase();

      return campos.includes(q);
    });
  }, [listaActual, periodo, busqueda, solapa]);

  // Filtrado de Documentos del Estudio (VEPs, Constancias, Facturas y NC)
  const documentosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return solicitudesDocumentos.filter((doc) => {
      if (!coincideFiltroTipoDocumento(doc, filtroTipoDoc)) return false;
      if (!q) return true;
      const campos = [
        limpiarFechasLargasEnTexto(doc.tipo),
        limpiarFechasLargasEnTexto(doc.detalle),
        limpiarFechasLargasEnTexto(doc.periodo),
        limpiarFechasLargasEnTexto(doc.observacionesLimpias),
        doc.estado,
        formatFechaAR(doc.fecha)
      ]
        .join(' ')
        .toLowerCase();
      return campos.includes(q);
    });
  }, [solicitudesDocumentos, filtroTipoDoc, busqueda]);

  const documentosConPdfListo = useMemo(
    () =>
      documentosFiltrados.filter((doc) => {
        const estLower = String(doc.estado || '').toLowerCase();
        const tieneLink = Boolean(doc.urlDescarga || doc.pdfUrl || doc.urlVista);
        return tieneLink && !estLower.includes('rechaz') && !estLower.includes('cancel');
      }).length,
    [documentosFiltrados]
  );

  const sumaTotalFiltrada = useMemo(
    () =>
      filtrados.reduce((acc, item) => {
        const val = Number(item.importe) || 0;
        // Las Notas de Crédito restan en ventas si están emitidas
        if (solapa === 'ventas' && String(item.tipoComprobante || '').toLowerCase().includes('crédito')) {
          return acc - val;
        }
        // Comprobantes duplicados no suman al total
        if (String(item.estado || '').toLowerCase().includes('duplicado')) {
          return acc;
        }
        return acc + val;
      }, 0),
    [filtrados, solapa]
  );

  const obtenerEstiloEstado = (estadoRaw) => {
    const est = String(estadoRaw || '').toLowerCase();
    if (est.includes('emitida') || est.includes('cae')) {
      return {
        label: 'Emitida / Con CAE',
        cls: 'bg-emerald-100 text-emerald-900 border-emerald-200',
        Icon: CheckCircle2,
        esError: false
      };
    }
    if (est.includes('registrado')) {
      return {
        label: 'Registrado',
        cls: 'bg-emerald-100 text-emerald-900 border-emerald-200',
        Icon: CheckCircle2,
        esError: false
      };
    }
    if (est.includes('duplicado')) {
      return {
        label: 'Duplicado',
        cls: 'bg-red-100 text-red-900 border-red-200',
        Icon: XCircle,
        esError: true
      };
    }
    if (est.includes('observado') || est.includes('ilegible') || est.includes('rechaz')) {
      return {
        label: 'Observado / Ilegible',
        cls: 'bg-red-100 text-red-900 border-red-200',
        Icon: AlertCircle,
        esError: true
      };
    }
    return {
      label: est.includes('solicitada') ? 'Solicitada / En revisión' : 'En revisión',
      cls: 'bg-amber-100 text-amber-900 border-amber-200',
      Icon: Clock,
      esError: false
    };
  };

  const handleDescargarPdf = async (item) => {
    const tipoSolapa = item._solapa || solapa;
    if (tipoSolapa === 'ventas') {
      try {
        const diseno = leerDisenoCliente(cliente?.CUIT, cliente);
        const { blob, filename } = await generarComprobantePDF({
          tipo: 'FACTURA',
          cliente,
          receptor: {
            nombre: item.receptorNombre || item.receptorTipo || 'Consumidor Final',
            documento: item.receptorDocumento || ''
          },
          items: [
            {
              descripcion: item.descripcion || item.tipoComprobante || 'Servicios profesionales',
              cantidad: 1,
              precioUnitario: Number(item.importe) || 0
            }
          ],
          observaciones: item.observacion || '',
          arcaData: {
            tipoComprobante: item.tipoComprobante || 'Factura C',
            numeroComprobante: item.numeroComprobante || '0001-00000001',
            fecha: item.fecha,
            fechaDesde: item.fechaDesde || '',
            fechaHasta: item.fechaHasta || '',
            condicionVenta: item.condicionVenta || '',
            cae: item.cae || '',
            vtoCae: item.vtoCae || item.caeVto || ''
          },
          diseno
        });
        descargarBlob(blob, filename);
        onToast('Factura PDF descargada con tu diseño de marca.');
        return;
      } catch {
        // Fallback al enlace externo o PDF liviano
      }
    }
    if (item.archivoUrl && item.archivoUrl.startsWith('http')) {
      window.open(item.archivoUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const blob = generarPdfComprobante(item, tipoSolapa, cliente);
    const nombre = `${tipoSolapa === 'ventas' ? 'Venta' : 'Compra'}_${item.numeroComprobante || item.id}.pdf`.replace(/\s+/g, '_');
    descargarBlob(blob, nombre);
    onToast('PDF descargado.');
  };

  const handleCompartir = async (item) => {
    const tipoSolapa = item._solapa || solapa;
    const titulo =
      tipoSolapa === 'ventas'
        ? `${item.tipoComprobante} ${item.numeroComprobante || ''}`.trim()
        : `Comprobante ${item.proveedor}`;
    const texto = `${titulo} • Fecha: ${formatFechaAR(item.fecha)} • Importe: ${formatARS(item.importe)}${
      item.cae ? ` • CAE: ${item.cae}` : ''
    }`;

    let blob = null;
    let nombreArchivo = `${titulo.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`;
    if (tipoSolapa === 'ventas') {
      try {
        const diseno = leerDisenoCliente(cliente?.CUIT, cliente);
        const resPdf = await generarComprobantePDF({
          tipo: 'FACTURA',
          cliente,
          receptor: {
            nombre: item.receptorNombre || item.receptorTipo || 'Consumidor Final',
            documento: item.receptorDocumento || ''
          },
          items: [
            {
              descripcion: item.descripcion || item.tipoComprobante || 'Servicios profesionales',
              cantidad: 1,
              precioUnitario: Number(item.importe) || 0
            }
          ],
          observaciones: item.observacion || '',
          arcaData: {
            tipoComprobante: item.tipoComprobante || 'Factura C',
            numeroComprobante: item.numeroComprobante || '0001-00000001',
            fecha: item.fecha,
            fechaDesde: item.fechaDesde || '',
            fechaHasta: item.fechaHasta || '',
            condicionVenta: item.condicionVenta || '',
            cae: item.cae || '',
            vtoCae: item.vtoCae || item.caeVto || ''
          },
          diseno
        });
        blob = resPdf.blob;
        nombreArchivo = resPdf.filename;
      } catch {
        blob = generarPdfComprobante(item, tipoSolapa, cliente);
      }
    } else if (!(item.archivoUrl && item.archivoUrl.startsWith('http'))) {
      blob = generarPdfComprobante(item, tipoSolapa, cliente);
    }

    const res = await compartirDocumento({
      titulo,
      texto,
      url:
        tipoSolapa !== 'ventas' && item.archivoUrl && item.archivoUrl.startsWith('http')
          ? item.archivoUrl
          : undefined,
      blob,
      nombreArchivo
    });
    if (res.shared) {
      onToast(
        res.method === 'download-fallback'
          ? 'Se descargó el PDF para compartir.'
          : 'Comprobante listo para compartir.'
      );
    }
  };

  const handleDescargarDocumentoEstudio = (doc) => {
    const linkFinal = doc?.urlDescarga || doc?.pdfUrl || doc?.urlVista;
    if (!linkFinal) return;
    if (linkFinal.includes('/demo-')) {
      const esVep = String(doc.tipo || '').toLowerCase().includes('vep');
      if (esVep) {
        onToast('En modo producción este botón descarga directamente el PDF real del VEP desde Google Drive.');
        return;
      }
      const blob = generarPdfConstancia(cliente);
      descargarBlob(blob, `${String(doc.tipo || 'Documento').replace(/\s+/g, '_')}_${cliente.CUIT}.pdf`);
      onToast('PDF descargado en tu dispositivo.');
      return;
    }
    window.open(linkFinal, '_blank', 'noopener,noreferrer');
    onToast('Abriendo PDF para descargar...');
  };

  const handleCompartirDocumentoEstudio = async (doc) => {
    const linkCompartir = doc?.urlVista || doc?.pdfUrl || doc?.urlDescarga;
    if (!linkCompartir) return;
    const esDemoLink = linkCompartir.includes('/demo-');
    const esVep = String(doc.tipo || '').toLowerCase().includes('vep');
    const blob = esDemoLink && !esVep ? generarPdfConstancia(cliente) : null;
    const tipoLimpio = limpiarFechasLargasEnTexto(doc.tipo || 'Documento');
    const detalleLimpio = limpiarFechasLargasEnTexto(doc.detalle || '');

    const res = await compartirDocumento({
      titulo: `${tipoLimpio} — ${cliente.Cliente}`,
      texto: `${tipoLimpio}${detalleLimpio ? ` (${detalleLimpio})` : ''} — GR Estudio Impositivo Digital`,
      url: esDemoLink ? undefined : linkCompartir,
      blob,
      nombreArchivo: `${tipoLimpio.replace(/\s+/g, '_')}_${cliente.CUIT}.pdf`
    });

    if (res.shared) {
      onToast(
        res.method === 'clipboard-fallback'
          ? 'Enlace del PDF copiado para compartir.'
          : res.method === 'download-fallback'
            ? 'PDF descargado para compartir.'
            : 'Documento listo para compartir.'
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabecera + Solapas Internas */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 space-y-3.5">
        <div>
          <h2 className="text-lg font-black text-petroleo leading-tight">Historial y Documentos</h2>
          <p className="text-xs text-slate-500">
            Consultá tus ventas, compras y todos los PDFs enviados por el estudio.
          </p>
        </div>

        {/* 1. Tres solapas internas: Ventas | Compras y Gastos | Documentos */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setSolapa('ventas')}
            className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold leading-tight flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 text-center transition ${
              solapa === 'ventas'
                ? 'bg-petroleo text-white shadow-sm'
                : 'text-slate-600 hover:text-petroleo'
            }`}
          >
            <span>Ventas</span>
            <span className="opacity-80 text-[10px] sm:text-[11px]">({ventas.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSolapa('compras')}
            className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold leading-tight flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 text-center transition ${
              solapa === 'compras'
                ? 'bg-ladrillo text-white shadow-sm'
                : 'text-slate-600 hover:text-ladrillo'
            }`}
          >
            <span>Compras y Gastos</span>
            <span className="opacity-80 text-[10px] sm:text-[11px]">({comprasGastos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSolapa('documentos')}
            className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold leading-tight flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 text-center transition ${
              solapa === 'documentos'
                ? 'bg-petroleo text-white shadow-sm'
                : 'text-slate-600 hover:text-petroleo'
            }`}
          >
            <span>Documentos</span>
            <span className="opacity-80 text-[10px] sm:text-[11px]">({solicitudesDocumentos.length})</span>
          </button>
        </div>

        {/* 2. Filtros según solapa */}
        {solapa === 'documentos' ? (
          <div className="space-y-2.5">
            {/* Filtro rápido por tipo de documento */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTROS_TIPO_DOCUMENTO.map((tipoFiltro) => {
                const activo = filtroTipoDoc === tipoFiltro;
                return (
                  <button
                    key={tipoFiltro}
                    type="button"
                    onClick={() => setFiltroTipoDoc(tipoFiltro)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold border transition ${
                      activo
                        ? 'bg-petroleo text-white border-petroleo shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-petroleo/40 hover:text-petroleo'
                    }`}
                  >
                    {tipoFiltro}
                  </button>
                );
              })}
            </div>

            {/* Buscador de documentos */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar VEP, constancia, factura, fecha..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-xs font-semibold focus:outline-none focus:border-petroleo"
              />
            </div>

            {/* Resumen superior de Documentos */}
            <div className="bg-petroleo text-white rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-hueso block">
                  Documentos mostrados
                </span>
                <strong className="text-base font-black">{documentosFiltrados.length}</strong>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-hueso block">
                  Listos en PDF
                </span>
                <strong className="text-base font-black">{documentosConPdfListo}</strong>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Filtros: Período + Buscador */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5">
                <select
                  aria-label="Filtrar por período mensual"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-xs font-extrabold text-petroleo focus:outline-none focus:border-petroleo"
                >
                  {periodosDisponibles.map((p) => (
                    <option key={p} value={p}>
                      {p === 'Todos' ? 'Todos los meses' : p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-7 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar texto, N° o monto..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-xs font-semibold focus:outline-none focus:border-petroleo"
                />
              </div>
            </div>

            {/* Barra superior de totales filtrados */}
            <div className="bg-petroleo text-white rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-hueso block">
                  Comprobantes filtrados
                </span>
                <strong className="text-base font-black">{filtrados.length}</strong>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-hueso block">
                  Suma total filtrada
                </span>
                <strong className="text-base font-black">{formatARS(sumaTotalFiltrada)}</strong>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Lista según solapa */}
      {solapa === 'documentos' ? (
        documentosFiltrados.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/80 space-y-2">
            <FileDown className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-extrabold text-slate-700">
              {solicitudesDocumentos.length === 0
                ? 'Todavía no tenés documentos enviados'
                : 'Sin documentos en este filtro'}
            </p>
            <p className="text-xs text-slate-500">
              {solicitudesDocumentos.length === 0
                ? 'Cuando el estudio te envíe un VEP, Constancia, Factura o Nota de Crédito, aparecerá acá para ver o compartir.'
                : 'Probá eligiendo “Todos” o borrando el texto del buscador.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documentosFiltrados.map((doc) => {
              const estLower = String(doc.estado || '').toLowerCase();
              const esEnviado =
                estLower.includes('enviad') ||
                estLower.includes('emitid') ||
                estLower.includes('cae') ||
                estLower.includes('listo');
              const esError =
                estLower.includes('rechaz') ||
                estLower.includes('observ') ||
                estLower.includes('cancel');
              const tieneLinkPdf = Boolean(doc.urlDescarga || doc.pdfUrl || doc.urlVista);
              const tienePdfListo = tieneLinkPdf && !esError;

              const badgeCls = esEnviado
                ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                : esError
                  ? 'bg-red-100 text-red-900 border-red-200'
                  : 'bg-amber-100 text-amber-900 border-amber-200';

              const tipoLimpio = limpiarFechasLargasEnTexto(doc.tipo || 'Documento');
              const detalleLimpio = limpiarFechasLargasEnTexto(doc.detalle || '');
              const obsLimpias = limpiarFechasLargasEnTexto(doc.observacionesLimpias || '');

              return (
                <article
                  key={doc.id}
                  className={`rounded-3xl p-4 shadow-sm border space-y-2.5 ${
                    tienePdfListo
                      ? 'bg-white border-emerald-200/90'
                      : 'bg-white border-slate-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-black text-petroleo leading-snug">
                        {tipoLimpio}
                      </p>
                      {doc.fecha && (
                        <span className="text-[11px] text-slate-500 font-semibold">
                          {formatFechaAR(doc.fecha)}
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border shrink-0 ${badgeCls}`}
                    >
                      {esEnviado ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : esError ? (
                        <AlertCircle className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      <span>{doc.estado}</span>
                    </span>
                  </div>

                  {detalleLimpio && (
                    <p className="text-xs font-semibold text-slate-700 leading-snug">
                      {detalleLimpio}
                    </p>
                  )}

                  {obsLimpias && (
                    <p className="text-[11px] text-slate-600 leading-snug bg-[#F8FAFC] rounded-xl px-3 py-2 border border-slate-100">
                      {obsLimpias}
                    </p>
                  )}

                  {tienePdfListo && (
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDescargarDocumentoEstudio(doc)}
                        className="py-3 px-3 rounded-2xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span>Ver / Descargar PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCompartirDocumentoEstudio(doc)}
                        className="py-3 px-3 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <Share2 className="w-4 h-4 shrink-0" />
                        <span>Compartir</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/80 space-y-2">
          <FileText className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-extrabold text-slate-700">Sin comprobantes en este filtro</p>
          <p className="text-xs text-slate-500">
            Probá cambiando el período a “Todos los meses” o borrando el texto de búsqueda.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((item) => {
            const est = obtenerEstiloEstado(item.estado);
            const EstadoIcon = est.Icon;
            const esNotaCredito =
              solapa === 'ventas' && String(item.tipoComprobante || '').toLowerCase().includes('crédito');

            return (
              <article
                key={item.id}
                className={`bg-white rounded-3xl p-4 shadow-sm border space-y-3 ${
                  est.esError ? 'border-red-300' : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-500">
                        {formatFechaAR(item.fecha)}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] font-extrabold text-petroleo">
                        {solapa === 'ventas' ? item.tipoComprobante : item.clasificacion}
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-slate-900 mt-0.5 leading-snug">
                      {solapa === 'ventas'
                        ? item.receptorNombre || item.receptorTipo
                        : item.proveedor}
                    </h3>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border shrink-0 ${est.cls}`}
                  >
                    <EstadoIcon className="w-3 h-3" />
                    {est.label}
                  </span>
                </div>

                {/* Detalles + Importe */}
                <div className="flex items-end justify-between gap-3 bg-[#F8FAFC] rounded-2xl p-3 border border-slate-100">
                  <div className="min-w-0 space-y-0.5 text-[11px] text-slate-600">
                    {item.numeroComprobante && (
                      <p className="font-mono font-bold text-slate-800">
                        N° {item.numeroComprobante}
                      </p>
                    )}
                    {item.cae && (
                      <p className="font-mono text-emerald-800 font-bold">CAE: {item.cae}</p>
                    )}
                    {(item.descripcion || item.observacion) && (
                      <p className="line-clamp-2 text-slate-600">
                        {item.descripcion || item.observacion}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Importe</span>
                    <strong
                      className={`text-base font-black ${
                        esNotaCredito ? 'text-ladrillo' : 'text-petroleo'
                      }`}
                    >
                      {esNotaCredito ? `- ${formatARS(item.importe)}` : formatARS(item.importe)}
                    </strong>
                  </div>
                </div>

                {/* Motivo escrito por el estudio cuando está Observado / Ilegible o Duplicado */}
                {est.esError && item.motivoObservacion && (
                  <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900">
                    <span className="font-black uppercase text-[10px] text-red-700 block mb-0.5">
                      Motivo informado por el estudio:
                    </span>
                    <p className="font-semibold leading-snug">{item.motivoObservacion}</p>
                  </div>
                )}

                {/* Acciones: Ver archivo / PDF + Compartir */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setVisorItem({ ...item, _solapa: solapa })}
                    className="py-2.5 px-3 rounded-xl bg-petroleo-50 hover:bg-petroleo-100 text-petroleo font-extrabold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver archivo / PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCompartir(item)}
                    className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Compartir</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* MODAL VISOR DE COMPROBANTE */}
      {visorItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-petroleo text-white px-5 py-4 flex items-center justify-between">
              <h4 className="font-extrabold text-sm truncate pr-2">
                {visorItem._solapa === 'ventas'
                  ? `${visorItem.tipoComprobante} ${visorItem.numeroComprobante || ''}`
                  : visorItem.proveedor}
              </h4>
              <button
                type="button"
                onClick={() => setVisorItem(null)}
                className="p-1 rounded-lg hover:bg-white/15"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {visorItem.archivoUrl && visorItem.archivoUrl.startsWith('data:image') ? (
                <img
                  src={visorItem.archivoUrl}
                  alt="Vista previa del comprobante"
                  className="w-full max-h-72 object-contain rounded-2xl border border-slate-200 bg-slate-50"
                />
              ) : (
                <div className="bg-hueso/60 border border-hueso-border rounded-2xl p-4 text-center space-y-1.5">
                  <FileText className="w-9 h-9 text-petroleo mx-auto" />
                  <p className="text-xs font-extrabold text-petroleo">
                    {visorItem.archivoNombre || 'Comprobante digital PDF'}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Tocá “Descargar PDF” para abrir o guardar el respaldo completo.
                  </p>
                </div>
              )}

              <div className="bg-[#F8FAFC] rounded-2xl p-3.5 border border-slate-200 space-y-1.5 text-xs">
                <p><strong>Fecha:</strong> {formatFechaAR(visorItem.fecha)}</p>
                <p><strong>Importe:</strong> {formatARS(visorItem.importe)}</p>
                {visorItem.numeroComprobante && (
                  <p><strong>N° Comprobante:</strong> <span className="font-mono">{visorItem.numeroComprobante}</span></p>
                )}
                {visorItem.cae && (
                  <p><strong>CAE:</strong> <span className="font-mono">{visorItem.cae}</span></p>
                )}
                <p><strong>Estado:</strong> {visorItem.estado}</p>
                {(visorItem.descripcion || visorItem.observacion) && (
                  <p><strong>Detalle:</strong> {visorItem.descripcion || visorItem.observacion}</p>
                )}
                {visorItem.motivoObservacion && (
                  <p className="text-red-700 font-bold">
                    <strong>Observación del estudio:</strong> {visorItem.motivoObservacion}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleDescargarPdf(visorItem)}
                  className="py-3 rounded-2xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCompartir(visorItem)}
                  className="py-3 rounded-2xl bg-ladrillo hover:bg-ladrillo-dark text-white font-extrabold text-xs flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Compartir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
