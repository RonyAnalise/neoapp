import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function generateInvoicePdf(element: HTMLElement, invoiceNumber: string): Promise<void> {
  try {
    // Render the element to canvas at high resolution
    const canvas = await html2canvas(element, {
      scale: 2, // 2x crisp retina resolution
      useCORS: true,
      logging: false,
      backgroundColor: '#059669', // background green
      windowWidth: 1200,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // Create A4 PDF (210mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Scale canvas image proportionally to fill the page neatly
    const imgProps = pdf.getImageProperties(imgData);
    const imgRatio = imgProps.width / imgProps.height;
    const pageRatio = pdfWidth / pdfHeight;

    let renderWidth = pdfWidth;
    let renderHeight = pdfWidth / imgRatio;

    if (renderHeight > pdfHeight) {
      renderHeight = pdfHeight;
      renderWidth = pdfHeight * imgRatio;
    }

    const xOffset = (pdfWidth - renderWidth) / 2;
    const yOffset = (pdfHeight - renderHeight) / 2;

    pdf.addImage(imgData, 'JPEG', xOffset, yOffset, renderWidth, renderHeight);
    pdf.save(`Fatura_NeoEnergia_${invoiceNumber.replace(/\s+/g, '_')}.pdf`);
  } catch (error) {
    console.error('Erro ao gerar PDF da fatura:', error);
    throw new Error('Não foi possível gerar o PDF. Verifique se a visualização está carregada.');
  }
}

export function printInvoice(): void {
  window.print();
}
