import React, { useEffect, useRef } from 'react';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip
} from 'chart.js';
import { formatARS, formatARSSinDecimales } from '../utils/fiscalCalculations.js';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip
);

const dibujarRectanguloRedondeado = (ctx, x, y, width, height, radius) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

/**
 * Dona individual reutilizable (para Ventas Cat. Actual o Compras/Gastos Art. 20 Cat. K)
 * Cada medidor utiliza su propio color independiente según su propio porcentaje.
 */
export function DoughnutMedidorIndividual({
  porcentaje = 0,
  colorHex = '#16a34a',
  etiquetaCentro = '',
  subetiquetaCentro = '',
  labelConsumido = '% Consumido',
  labelRestante = '% Margen'
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const consumido = Math.min(100, Math.max(0, porcentaje));
    const restante = Math.max(0, 100 - consumido);

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = [consumido, restante];
      chartRef.current.data.datasets[0].backgroundColor = [colorHex, '#e2e8f0'];
      chartRef.current.update();
      return;
    }

    chartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [labelConsumido, labelRestante],
        datasets: [
          {
            data: [consumido, restante],
            backgroundColor: [colorHex, '#e2e8f0'],
            borderWidth: 0,
            hoverOffset: 3,
            cutout: '76%',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (context) => ` ${context.label}: ${Number(context.raw).toFixed(1)}%` }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [porcentaje, colorHex, labelConsumido, labelRestante]);

  return (
    <div className="h-44 w-full flex items-center justify-center">
      <div className="relative h-40 w-40 flex items-center justify-center shrink-0">
        <canvas ref={canvasRef} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
          <span
            className={`text-2xl font-black leading-none tabular-nums ${
              porcentaje > 100 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {porcentaje.toFixed(1)}%
          </span>
          {etiquetaCentro && (
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mt-1 leading-tight">
              {etiquetaCentro}
            </span>
          )}
          {subetiquetaCentro && (
            <span className="text-[10px] font-bold text-slate-400 mt-0.5 leading-tight">
              {subetiquetaCentro}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function BarComparativaChart({ ventasTotales, comprasTotales, limiteComprasAnual, porcLimiteTexto }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');

    const lineaLimitePlugin = {
      id: 'lineaLimiteGastos',
      afterDatasetsDraw(chart) {
        const {
          ctx: c,
          chartArea: { left, right, top, bottom },
          scales: { y }
        } = chart;
        const limiteVal = chart.config.options.plugins.lineaLimiteGastos?.valor || 0;
        const etiquetaPorc = chart.config.options.plugins.lineaLimiteGastos?.etiqueta || '40%';
        if (limiteVal <= 0) return;

        const yPos = y.getPixelForValue(limiteVal);
        if (yPos < top || yPos > bottom) return;

        c.save();
        c.beginPath();
        c.setLineDash([6, 4]);
        c.lineWidth = 2.2;
        c.strokeStyle = '#dc2626';
        c.moveTo(left, yPos);
        c.lineTo(right, yPos);
        c.stroke();

        const texto = `Límite ${etiquetaPorc} Cat. K: ${formatARSSinDecimales(limiteVal)}`;
        c.font = 'bold 10.5px Inter, sans-serif';
        const textWidth = c.measureText(texto).width;
        const boxX = Math.max(left, right - textWidth - 12);
        const boxY = Math.max(top, yPos - 22);

        c.fillStyle = '#dc2626';
        dibujarRectanguloRedondeado(c, boxX, boxY, textWidth + 10, 18, 4);
        c.fill();

        c.fillStyle = '#ffffff';
        c.fillText(texto, boxX + 5, boxY + 12.5);
        c.restore();
      }
    };

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = [ventasTotales, comprasTotales];
      chartRef.current.options.plugins.lineaLimiteGastos.valor = limiteComprasAnual;
      chartRef.current.options.plugins.lineaLimiteGastos.etiqueta = porcLimiteTexto;
      chartRef.current.options.scales.y.suggestedMax =
        Math.max(ventasTotales, comprasTotales, limiteComprasAnual) * 1.18;
      chartRef.current.update();
      return;
    }

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Ventas 12m', 'Compras / Gastos'],
        datasets: [
          {
            label: 'Monto Acumulado ($)',
            data: [ventasTotales, comprasTotales],
            backgroundColor: ['#0F4C5C', '#E36414'],
            borderRadius: 10,
            barThickness: 48,
            maxBarThickness: 62
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(ventasTotales, comprasTotales, limiteComprasAnual) * 1.18,
            ticks: {
              font: { family: 'Inter', size: 10.5, weight: '600' },
              color: '#64748b',
              callback: (val) => `$${(val / 1000000).toFixed(1)}M`
            },
            grid: { color: '#f1f5f9' }
          },
          x: {
            ticks: { font: { family: 'Inter', size: 11.5, weight: '700' }, color: '#1e293b' },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          lineaLimiteGastos: { valor: limiteComprasAnual, etiqueta: porcLimiteTexto },
          tooltip: { callbacks: { label: (context) => ` ${formatARS(context.raw)}` } }
        }
      },
      plugins: [lineaLimitePlugin]
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [ventasTotales, comprasTotales, limiteComprasAnual, porcLimiteTexto]);

  return (
    <div className="h-56 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
