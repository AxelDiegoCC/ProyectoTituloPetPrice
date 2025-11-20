// src/app/services/report.service.ts
import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type PricePoint = { date: Date; price: number };

@Injectable({ providedIn: 'root' })
export class ReportService {
  private C = {
    primary: [13, 181, 169] as [number, number, number],
    text: [25, 33, 43] as [number, number, number],
    muted: [131, 144, 156] as [number, number, number],
    border: [231, 236, 242] as [number, number, number],
    amber: [240, 178, 74] as [number, number, number],
  };
  private PAGE = { w: 595.28, h: 841.89 };
  private MARGIN_X = 48;

  private formatCLP(n: number) {
    try {
      return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
    } catch {
      return `$${(n || 0).toLocaleString('es-CL')}`;
    }
  }

  private async imageToDataURL(url?: string): Promise<string | null> {
    if (!url) return null;
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  private sectionTitle(doc: jsPDF, text: string, y: number) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...this.C.text);
    doc.text(text, this.MARGIN_X, y);
    doc.setDrawColor(...this.C.primary);
    doc.setLineWidth(1);
    doc.line(this.MARGIN_X, y + 6, this.PAGE.w - this.MARGIN_X, y + 6);
    return y + 18;
  }

  private footer(doc: jsPDF) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...this.C.muted);
      const txt = `PetPrice • ${new Date().toLocaleDateString('es-CL')} • Página ${i} de ${pageCount}`;
      doc.text(txt, this.MARGIN_X, this.PAGE.h - 24);
    }
  }

  // ⬅️ NUEVO: renderiza un gráfico simple a PNG (canvas -> dataURL)
  // Estilo parecido al Chart.js del detalle: línea verde + área rellena + stepped
  private buildHistoryChartImage(history: {date: Date; price: number}[], width = 520, height = 220): string | null {
    if (!history?.length || typeof document === 'undefined') return null;

    // Ordena por fecha
    history = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Paleta similar a tu página
    const LINE = '#4CAF50';                 // borde (verde)
    const FILL = 'rgba(76,175,80,0.20)';    // área translúcida
    const GRID = '#E9EEF5';                 // cuadrícula suave
    const AXIS = '#A3AFBF';                 // etiquetas de ejes
    const BG   = '#FFFFFF';                 // fondo blanco

    // Márgenes internos y zona de ploteo
    const pad = { l: 46, r: 14, t: 18, b: 46 };
    const w = width, h = height;
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;

    // Rango Y “bonito”
    const min = Math.min(...history.map(p => p.price));
    const max = Math.max(...history.map(p => p.price));
    const spanRaw = Math.max(1, max - min);
    // redondea a múltiplos “bonitos”
    const pow10 = Math.pow(10, Math.max(0, Math.floor(Math.log10(spanRaw)) - 1));
    const stepY = Math.max(pow10, Math.round(spanRaw / 5 / pow10) * pow10);
    const yMin = Math.floor(min / stepY) * stepY;
    const yMax = Math.ceil(max / stepY) * stepY;
    const yRange = Math.max(stepY, yMax - yMin);

    // Escala X por tiempo real
    const t0 = history[0].date.getTime();
    const t1 = history[history.length - 1].date.getTime();
    const tRange = Math.max(1, t1 - t0);

    const toX = (t: number) => pad.l + ((t - t0) / tRange) * cw;
    const toY = (price: number) => pad.t + (1 - (price - yMin) / yRange) * ch;

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fondo
    ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);

    // Cuadrícula Y (5 líneas)
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const yy = pad.t + (i * ch) / ticks;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
    }
    // Eje X
    ctx.beginPath(); ctx.moveTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();
    // Eje Y
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.stroke();

    // Área “stepped” (antes de la línea para que quede debajo)
    ctx.beginPath();
    const startX = toX(history[0].date.getTime());
    const startY = toY(history[0].price);
    ctx.moveTo(startX, h - pad.b);
    ctx.lineTo(startX, startY);

    for (let i = 0; i < history.length - 1; i++) {
      const p = history[i];
      const n = history[i + 1];
      const x1 = toX(p.date.getTime());
      const y1 = toY(p.price);
      const x2 = toX(n.date.getTime());
      const y2 = toY(n.price);
      // horizontal -> vertical (stepped: 'before')
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y2);
    }
    const lastX = toX(history[history.length - 1].date.getTime());
    ctx.lineTo(lastX, h - pad.b);
    ctx.closePath();
    ctx.fillStyle = FILL; ctx.fill();

    // Línea stepped
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = 0; i < history.length - 1; i++) {
      const p = history[i];
      const n = history[i + 1];
      const x1 = toX(p.date.getTime());
      const y1 = toY(p.price);
      const x2 = toX(n.date.getTime());
      const y2 = toY(n.price);
      ctx.lineTo(x2, y1); // horizontal
      ctx.lineTo(x2, y2); // vertical
    }
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();

    // Puntos
    ctx.fillStyle = LINE;
    history.forEach(p => {
      const x = toX(p.date.getTime());
      const y = toY(p.price);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });

    // Etiquetas Y (CLP)
    ctx.fillStyle = AXIS; ctx.font = '10px Helvetica';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= ticks; i++) {
      const val = yMin + (i * yRange) / ticks;
      const yy = pad.t + (1 - (val - yMin) / yRange) * ch;
      ctx.fillText(this.formatCLP(Math.round(val)), pad.l - 8, yy);
    }

    // Etiquetas X (inicio, medio, fin) en -45°
    const lbl = (d: Date) => new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: undefined }).format(d).replace('.', '');
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    const dates = [history[0].date, history[Math.floor(history.length / 2)].date, history[history.length - 1].date];
    [dates[0], dates[1], dates[2]].forEach((d, idx) => {
      const x = idx === 0 ? toX(d.getTime()) : idx === 1 ? toX((t0 + t1) / 2) : toX(d.getTime());
      const y = h - pad.b + 6;
      ctx.save(); ctx.translate(x, y); ctx.rotate((-45 * Math.PI) / 180);
      ctx.fillText(lbl(d), 0, 0); ctx.restore();
    });

    // Mini leyenda arriba
    ctx.fillStyle = LINE;
    ctx.fillRect(pad.l, pad.t - 14, 26, 4);
    ctx.fillStyle = AXIS; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Precio mínimo histórico (CLP)', pad.l + 32, pad.t - 10);

    return canvas.toDataURL('image/png');
  }

  async generateProductReport(opts: {
    product: any;
    bestOffer: { nombre: string; precio: number; url: string } | null;
    tiendas: Array<{ nombre: string; precio: number; url: string }>;
    avgRating: number;
    totalReviews: number;
    pageUrl?: string;
    // ⬅️ NUEVO
    history?: PricePoint[];
  }): Promise<Blob> {
    const { product, bestOffer, tiendas, avgRating, totalReviews, pageUrl, history = [] } = opts;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setTextColor(...this.C.text);

    // ===== Encabezado =====
    let y = 56;
    doc.setFillColor(...this.C.primary);
    doc.rect(0, 0, this.PAGE.w, 80, 'F');

    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
    doc.text('Reporte de Producto', this.MARGIN_X, 48);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-CL')}`, this.MARGIN_X, 66);

    // ===== Header ficha (logo a la izquierda) =====
    doc.setTextColor(...this.C.text);
    y = 100;

    const dataURL = await this.imageToDataURL('assets/img/logo.png');
    const imgW = 140, imgH = 140;

    if (dataURL) {
      doc.addImage(dataURL, 'PNG', this.MARGIN_X, y, imgW, imgH, undefined, 'FAST');
    } else {
      doc.setDrawColor(...this.C.border); doc.setFillColor(255, 255, 255);
      doc.rect(this.MARGIN_X, y, imgW, imgH, 'S');
      doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(...this.C.muted);
      doc.text('Logo no disponible', this.MARGIN_X + 24, y + imgH / 2);
      doc.setTextColor(...this.C.text);
    }

    const rightX = this.MARGIN_X + imgW + 18;
    let yRight = y + 4;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(product?.nombre || 'Producto', rightX, yRight); yRight += 16;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    if (product?.marca) { doc.text(`Marca: ${product.marca}`, rightX, yRight); yRight += 14; }

    if (product?.descripcion) {
      const w = this.PAGE.w - rightX - this.MARGIN_X;
      const desc = doc.splitTextToSize(product.descripcion, w);
      doc.text(desc, rightX, yRight); yRight += desc.length * 12 + 4;
    }

    // chips
    const chip = (label: string, value: string, x: number, yChip: number) => {
      const padX = 8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      const text = `${label}: ${value}`;
      const width = doc.getTextWidth(text) + padX * 2;
      doc.setDrawColor(...this.C.primary); doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, yChip - 10, width, 20, 6, 6, 'S');
      doc.text(text, x + padX, yChip + 3);
      return x + width + 8;
    };
    let chipX = rightX;
    chipX = chip('Rating', `${avgRating.toFixed(1)} / 5`, chipX, yRight + 8);
    chip('Opiniones', `${totalReviews}`, chipX, yRight + 8);

    y = Math.max(y + imgH, yRight + 28);

    // ===== Resumen de precios =====
    y = this.sectionTitle(doc, 'Resumen de precios', y);

    const precios = (tiendas ?? []).map(t => Number(t.precio)).filter(n => !isNaN(n) && n > 0);
    const tienePrecios = precios.length > 0;
    const precioMin = tienePrecios ? Math.min(...precios) : null;
    const precioMax = tienePrecios ? Math.max(...precios) : null;
    const precioProm = tienePrecios ? precios.reduce((a, b) => a + b, 0) / precios.length : null;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    const linesResumen: string[] = [];
    if (bestOffer) linesResumen.push(`Mejor precio: ${this.formatCLP(bestOffer.precio)} (${bestOffer.nombre})`);
    if (precioProm != null) linesResumen.push(`Promedio: ${this.formatCLP(Math.round(precioProm))}`);
    if (precioMin  != null) linesResumen.push(`Mínimo:  ${this.formatCLP(precioMin)}`);
    if (precioMax  != null) linesResumen.push(`Máximo:  ${this.formatCLP(precioMax)}`);
    if (linesResumen.length) { doc.text(linesResumen, this.MARGIN_X, y); y += linesResumen.length * 14 + 8; } else { y += 20; }

    // ===== Histórico de precios (imagen) =====
    if (history.length >= 2) {
      y = this.sectionTitle(doc, 'Histórico de precios', y);
      const chartPNG = this.buildHistoryChartImage(history, 480, 180);
      if (chartPNG) {
        const imgWgraph = this.PAGE.w - this.MARGIN_X * 2;
        const imgHgraph = 180;
        doc.addImage(chartPNG, 'PNG', this.MARGIN_X, y, imgWgraph, imgHgraph, undefined, 'FAST');
        y += imgHgraph + 12;
      } else {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(...this.C.muted);
        doc.text('No fue posible renderizar el gráfico.', this.MARGIN_X, y);
        doc.setTextColor(...this.C.text);
        y += 16;
      }
    }

    // ===== Tabla de tiendas =====
    if (tiendas?.length) {
      autoTable(doc, {
        startY: y,
        head: [['Tienda', 'Precio', 'Enlace']],
        body: tiendas.map(t => [t.nombre, this.formatCLP(Number(t.precio) || 0), t.url || '-']),
        theme: 'striped',
        headStyles: { fillColor: this.C.primary, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 6, halign: 'left', valign: 'middle' },
        alternateRowStyles: { fillColor: [246, 250, 252] },
        margin: { left: this.MARGIN_X, right: this.MARGIN_X },
      });
      y = (doc as any).lastAutoTable.finalY + 16;
    }

    // ===== Opiniones =====
    y = this.sectionTitle(doc, 'Opiniones', y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(`Promedio: ${avgRating.toFixed(1)} / 5   •   Total de opiniones: ${totalReviews}`, this.MARGIN_X, y);
    y += 20;

    if (pageUrl) {
      doc.setTextColor(0, 0, 255);
      doc.textWithLink('Ver ficha en PetPrice', this.MARGIN_X, y, { url: pageUrl });
      doc.setTextColor(...this.C.text);
      y += 16;
    }

    this.footer(doc);
    return doc.output('blob') as Blob;
  }
}
