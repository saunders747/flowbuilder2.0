import { useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

const SHEET_SIZES = {
  a4: [210, 297], a3: [297, 420], a2: [420, 594],
  a1: [594, 841], a0: [841, 1189], letter: [216, 279], tabloid: [279, 432],
};
const PLOTTER_WIDTHS = {
  'plotter-a0': 841, 'plotter-a1': 594, 'plotter-a2': 420,
  'plotter-36in': 914, 'plotter-24in': 610,
};

export function useCombinationTableExportPDF({ tableRef, pdfPaper, processName }) {
  const exportPDF = useCallback(async () => {
    const el = tableRef.current;
    if (!el) return;
    toast.info('Generating PDF…');
    const inputs = el.querySelectorAll('input, textarea');
    const replacements = [];
    inputs.forEach(input => {
      const span = document.createElement('span');
      span.textContent = input.value;
      span.style.cssText = window.getComputedStyle(input).cssText;
      span.style.display = 'inline-block';
      span.style.whiteSpace = 'pre-wrap';
      input.parentNode.insertBefore(span, input);
      input.style.display = 'none';
      replacements.push({ input, span });
    });
    try {
      const canvas = await html2canvas(el, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true,
        windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
      });
      const margin = 8; const titleH = 10; const footerH = 6;
      const isPlotter = pdfPaper.startsWith('plotter-');
      let pdf, pageW, pageH;
      const title = `Work Combination Table${processName ? ` — ${processName}` : ''}`;
      if (isPlotter) {
        pageW = PLOTTER_WIDTHS[pdfPaper];
        const printableW = pageW - margin * 2;
        const imgHmm = (canvas.height / canvas.width) * printableW;
        pageH = imgHmm + margin * 2 + titleH + footerH;
        pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, pageH] });
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
        pdf.text(title, margin, margin + 6);
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin + titleH, printableW, imgHmm);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
        pdf.text(`${pageW}mm wide plotter sheet — ${new Date().toLocaleDateString()}`, margin, pageH - margin);
      } else {
        const [format, orient] = pdfPaper.split('-');
        const [shortEdge, longEdge] = SHEET_SIZES[format];
        pageW = orient === 'landscape' ? longEdge : shortEdge;
        pageH = orient === 'landscape' ? shortEdge : longEdge;
        pdf = new jsPDF({ orientation: orient, unit: 'mm', format });
        const printableW = pageW - margin * 2;
        const printableH = pageH - margin * 2 - titleH - footerH;
        const imgWmm = printableW;
        const imgHmm = (canvas.height / canvas.width) * imgWmm;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(title, margin, margin + 5);
        if (imgHmm <= printableH) {
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin + titleH + (printableH - imgHmm) / 2, imgWmm, imgHmm);
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
          pdf.text(`Page 1 of 1 — ${new Date().toLocaleDateString()}`, margin, pageH - margin);
        } else {
          const pxPerMm = canvas.width / imgWmm;
          const sliceHpx = Math.floor(printableH * pxPerMm);
          const totalPages = Math.ceil(canvas.height / sliceHpx);
          for (let p = 0; p < totalPages; p++) {
            if (p > 0) pdf.addPage(format, orient);
            const sy = p * sliceHpx; const sh = Math.min(sliceHpx, canvas.height - sy);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width; sliceCanvas.height = sh;
            const ctx = sliceCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(title, margin, margin + 5);
            pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin + titleH, imgWmm, sh / pxPerMm);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
            pdf.text(`Page ${p + 1} of ${totalPages} — ${new Date().toLocaleDateString()}`, margin, pageH - margin);
          }
        }
      }
      pdf.save(`combination_table_${(processName || 'export').replace(/\s+/g, '_')}.pdf`);
      localStorage.setItem('mm_swb_pdf_paper', pdfPaper);
      toast.success('PDF exported');
    } catch (err) {
      console.error(err);
      toast.error('PDF export failed');
    } finally {
      replacements.forEach(({ input, span }) => { input.style.display = ''; span.remove(); });
    }
  }, [tableRef, pdfPaper, processName]);

  return { exportPDF };
}