import { jsPDF } from 'jspdf';
import type { Advertisement, Edition, EditionPage } from '../types/news.ts';

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
  bgColor = '#ffffff',
): { dataUrl: string; heightMm: number } {
  const pxPerMm = 4;
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
  drawCtx.fillStyle = bgColor;
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

function getParagraphsForPdf(summary: string, content?: string): string[] {
  const cleanSummary = (summary || '').trim();
  const cleanContent = (content || '').trim();
  if (!cleanContent || cleanContent === cleanSummary) {
    return cleanSummary ? cleanSummary.split(/\n+/).map((p) => p.trim()).filter(Boolean) : [];
  }
  const bodyParas = cleanContent
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const firstMatches =
    cleanSummary.length > 20 &&
    bodyParas.length > 0 &&
    bodyParas[0].toLowerCase().startsWith(cleanSummary.slice(0, 40).toLowerCase());
  return firstMatches ? bodyParas : [cleanSummary, ...bodyParas];
}

export function downloadEditionPdf(edition: Edition, ads: Advertisement[] = []): void {
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
  let pdfPageCounter = 0;

  const drawPageChrome = (sectionTitle: string, isContinuation = false) => {
    if (pdfPageCounter > 0) doc.addPage();
    pdfPageCounter += 1;

    doc.setFillColor(0, 101, 46);
    doc.rect(margin, 12, contentWidth, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('MAHEEP NEWS PORTAL', margin + 4, 20.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Detailed Digital Broadsheet  |  ${edition.edition_date}`, pageWidth - margin - 4, 20.5, { align: 'right' });

    let y = 32;
    const label = isContinuation ? `${sectionTitle} (Continued)` : sectionTitle;
    doc.setTextColor(0, 69, 31);
    if (hasNonLatin(label)) {
      const img = renderUnicodeTextToImage(label, contentWidth, 12.5, '700', '#00451F');
      doc.addImage(img.dataUrl, 'PNG', margin, y - 3, contentWidth, img.heightMm);
      y += img.heightMm + 1;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(label, margin, y);
      y += 5;
    }

    doc.setDrawColor(0, 101, 46);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);

    // Footer
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.25);
    doc.line(margin, 282, pageWidth - margin, 282);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text('Maheep News Portal · Sach Ke Saath, Janata Ke Vishwas Ke Saath', margin, 287);
    doc.text(`Sheet ${pdfPageCounter}`, pageWidth - margin, 287, { align: 'right' });

    return y + 6;
  };

  const drawAdBox = (ad: Advertisement, startY: number): number => {
    const boxY = startY;
    const textWidth = contentWidth - 8;
    const titleText = ad.title || 'Sponsored Notice';
    const descText = ad.description || '';
    const boxHeight = descText ? 23 : 16;

    doc.setFillColor(234, 245, 229);
    doc.setDrawColor(0, 101, 46);
    doc.setLineWidth(0.4);
    doc.rect(margin, boxY, contentWidth, boxHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(0, 69, 31);
    doc.text(
      `ADVERTISEMENT${ad.advertiser ? ` · SPONSORED BY ${ad.advertiser.toUpperCase()}` : ''}`,
      margin + 4,
      boxY + 4.5,
    );

    if (hasNonLatin(titleText)) {
      const tImg = renderUnicodeTextToImage(titleText, textWidth, 11, '700', '#111827', '#EAF5E5');
      doc.addImage(tImg.dataUrl, 'PNG', margin + 4, boxY + 6, textWidth, Math.min(7, tImg.heightMm));
    } else {
      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.text(doc.splitTextToSize(titleText, textWidth)[0] || titleText, margin + 4, boxY + 10);
    }

    if (descText) {
      if (hasNonLatin(descText)) {
        const dImg = renderUnicodeTextToImage(descText, textWidth, 9, '400', '#374151', '#EAF5E5');
        doc.addImage(dImg.dataUrl, 'PNG', margin + 4, boxY + 13, textWidth, Math.min(6, dImg.heightMm));
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(55, 65, 81);
        doc.text(doc.splitTextToSize(descText, textWidth)[0] || descText, margin + 4, boxY + 15.5);
      }
    }

    if (ad.target_url) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 101, 46);
      doc.text(`${ad.cta_text || 'Visit'}: ${ad.target_url}`, margin + 4, boxY + boxHeight - 2.5);
    }

    return boxY + boxHeight + 5;
  };

  pages.forEach((page, pIdx) => {
    let y = drawPageChrome(page.sectionTitle, false);

    if (ads.length > 0 && pIdx === 0) {
      y = drawAdBox(ads[0], y);
    }

    for (const art of page.articles) {
      if (y > 250) {
        y = drawPageChrome(page.sectionTitle, true);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 101, 46);
      const kicker = `${art.category_name || 'News'}${art.state_name ? ` · ${art.state_name}` : ''}${art.subtopic ? ` · ${art.subtopic}` : ''} · ${art.source_name || 'Maheep Desk'}`;
      doc.text(kicker, margin, y);
      y += 4.2;

      if (hasNonLatin(art.title)) {
        const titleImg = renderUnicodeTextToImage(art.title, contentWidth, 13.5, '700', '#111827');
        if (y + titleImg.heightMm > 272) y = drawPageChrome(page.sectionTitle, true);
        doc.addImage(titleImg.dataUrl, 'PNG', margin, y - 2, contentWidth, titleImg.heightMm);
        y += titleImg.heightMm + 2;
      } else {
        doc.setFont('times', 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(17, 24, 39);
        const titleLines = doc.splitTextToSize(art.title, contentWidth) as string[];
        if (y + titleLines.length * 5 > 272) y = drawPageChrome(page.sectionTitle, true);
        doc.text(titleLines, margin, y);
        y += titleLines.length * 5 + 1.2;
      }

      const paragraphs = getParagraphsForPdf(art.summary, art.content);
      for (const para of paragraphs) {
        if (hasNonLatin(para)) {
          const pImg = renderUnicodeTextToImage(para, contentWidth, 10.5, '400', '#374151');
          if (y + pImg.heightMm > 274) {
            y = drawPageChrome(page.sectionTitle, true);
          }
          doc.addImage(pImg.dataUrl, 'PNG', margin, y - 1.5, contentWidth, pImg.heightMm);
          y += pImg.heightMm + 1.5;
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(55, 65, 81);
          const pLines = doc.splitTextToSize(para, contentWidth) as string[];
          for (const line of pLines) {
            if (y > 274) {
              y = drawPageChrome(page.sectionTitle, true);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(9.5);
              doc.setTextColor(55, 65, 81);
            }
            doc.text(line, margin, y);
            y += 4.2;
          }
          y += 1.5;
        }
      }

      if (y > 274) y = drawPageChrome(page.sectionTitle, true);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `By ${art.author || 'Editorial Desk'}${art.source_url ? ` · Source: ${art.source_name}` : ''}`,
        margin,
        y,
      );
      y += 4;

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
    }

    if (ads.length > 0 && pIdx > 0 && y < 245) {
      drawAdBox(ads[pIdx % ads.length], y);
    }
  });

  doc.save(`maheep-news-edition-${edition.edition_date}.pdf`);
}
