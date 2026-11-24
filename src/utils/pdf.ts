import { jsPDF } from 'jspdf';
import type { Edition, EditionPage } from '../types/news.ts';

function hasNonLatin(text: string): boolean {
  return /[^\u0000-\u024F\u2000-\u206F]/.test(text);
}

/**
 * Renders any text block (including Hindi Devanagari script) onto an offscreen
 * high-DPI canvas and returns a PNG data URL so jsPDF preserves crisp Unicode shaping.
 */
function renderUnicodeTextToImage(
  text: string,
  widthMm: number,
  fontSizePx: number,
  fontWeight: '400' | '600' | '700',
  color: string,
): { dataUrl: string; heightMm: number } {
  const pxPerMm = 4; // ~101 DPI scaled cleanly
  const canvasWidth = Math.floor(widthMm * pxPerMm * 2);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const scaledFont = fontSizePx * 2;
  ctx.font = `${fontWeight} ${scaledFont}px "Noto Sans Devanagari", "Plus Jakarta Sans", sans-serif`;

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  const maxTextWidth = canvasWidth - 8;

  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxTextWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const lineHeight = Math.round(scaledFont * 1.42);
  canvas.width = canvasWidth;
  canvas.height = Math.max(lineHeight, lines.length * lineHeight + 8);

  const drawCtx = canvas.getContext('2d')!;
  drawCtx.fillStyle = '#ffffff';
  drawCtx.fillRect(0, 0, canvas.width, canvas.height);
  drawCtx.fillStyle = color;
  drawCtx.font = `${fontWeight} ${scaledFont}px "Noto Sans Devanagari", "Plus Jakarta Sans", sans-serif`;
  drawCtx.textBaseline = 'top';

  lines.forEach((line, i) => {
    drawCtx.fillText(line, 2, i * lineHeight + 2);
  });

  const heightMm = canvas.height / (pxPerMm * 2);
  return { dataUrl: canvas.toDataURL('image/png'), heightMm };
}

export function downloadEditionPdf(edition: Edition): void {
  let pages: EditionPage[] = [];
  try {
    const parsed = JSON.parse(edition.content_json || '{}');
    pages = Array.isArray(parsed.pages) ? parsed.pages : [];
  } catch {
    pages = [];
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  pages.forEach((page, pIdx) => {
    if (pIdx > 0) doc.addPage();

    // Header band
    doc.setFillColor(0, 101, 46); // #00652E
    doc.rect(margin, 12, contentWidth, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('MAHEEP NEWS PORTAL', margin + 4, 20.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`News from India & Beyond  |  ${edition.edition_date}`, pageWidth - margin - 4, 20.5, { align: 'right' });

    // Section subheader
    let y = 32;
    doc.setTextColor(0, 69, 31);
    if (hasNonLatin(page.sectionTitle)) {
      const img = renderUnicodeTextToImage(page.sectionTitle, contentWidth, 13, '700', '#00451F');
      doc.addImage(img.dataUrl, 'PNG', margin, y - 3, contentWidth, img.heightMm);
      y += img.heightMm + 1;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(page.sectionTitle, margin, y);
      y += 5;
    }

    doc.setDrawColor(0, 101, 46);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Articles on page
    for (const art of page.articles) {
      if (y > 258) break;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 101, 46);
      const kicker = `${art.category_name || 'News'}${art.state_name ? ` · ${art.state_name}` : ''} · ${art.source_name || 'Maheep Desk'}`;
      doc.text(kicker, margin, y);
      y += 4;

      if (hasNonLatin(art.title)) {
        const titleImg = renderUnicodeTextToImage(art.title, contentWidth, 14, '700', '#111827');
        doc.addImage(titleImg.dataUrl, 'PNG', margin, y - 2, contentWidth, titleImg.heightMm);
        y += titleImg.heightMm + 2;
      } else {
        doc.setFont('times', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(17, 24, 39);
        const titleLines = doc.splitTextToSize(art.title, contentWidth) as string[];
        doc.text(titleLines, margin, y);
        y += titleLines.length * 5.2 + 1;
      }

      if (hasNonLatin(art.summary)) {
        const sumImg = renderUnicodeTextToImage(art.summary, contentWidth, 11, '400', '#374151');
        doc.addImage(sumImg.dataUrl, 'PNG', margin, y - 2, contentWidth, sumImg.heightMm);
        y += sumImg.heightMm + 2;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(55, 65, 81);
        const sumLines = doc.splitTextToSize(art.summary, contentWidth) as string[];
        doc.text(sumLines, margin, y);
        y += sumLines.length * 4.2 + 2;
      }

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(`By ${art.author || 'Editorial Desk'}`, margin, y);
      y += 4;

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
    }

    // Footer
    doc.setDrawColor(209, 213, 219);
    doc.line(margin, 282, pageWidth - margin, 282);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text('Maheep News Portal · Sach Ke Saath, Janata Ke Vishwas Ke Saath', margin, 287);
    doc.text(`Page ${page.pageNumber} of ${pages.length}`, pageWidth - margin, 287, { align: 'right' });
  });

  doc.save(`maheep-news-edition-${edition.edition_date}.pdf`);
}
