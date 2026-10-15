import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function generateInvoicePdf(element: HTMLElement, invoiceNumber: string): Promise<void> {
  try {
    // Render the element to canvas at high resolution
    const canvas = await html2canvas(element, {
      scale: 2, // 2x crisp retina resolution
      useCORS: true,
      allowTaint: false, // CRITICAL: Never allow taint so toDataURL can export safely
      logging: false,
      backgroundColor: '#1b7a3e',
      scrollX: 0,
      scrollY: 0,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // Create A4 PDF (210mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

    // Margins to guarantee it fits on 1 single page without any spillover
    const margin = 5;
    const availWidth = pdfWidth - margin * 2;
    const availHeight = pdfHeight - margin * 2;

    const imgProps = pdf.getImageProperties(imgData);
    const imgRatio = imgProps.width / imgProps.height;

    let renderWidth = availWidth;
    let renderHeight = availWidth / imgRatio;

    if (renderHeight > availHeight) {
      renderHeight = availHeight;
      renderWidth = availHeight * imgRatio;
    }

    const xOffset = margin + (availWidth - renderWidth) / 2;
    const yOffset = margin + (availHeight - renderHeight) / 2;

    pdf.addImage(imgData, 'JPEG', xOffset, yOffset, renderWidth, renderHeight);

    // Disparo direto e confiável de download do arquivo PDF (funciona em iframes e todos os navegadores)
    const fileName = `Fatura_NeoEnergia_${invoiceNumber.replace(/\s+/g, '_')}.pdf`;
    const blob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 1500);
  } catch (error) {
    console.error('Erro ao gerar PDF da fatura:', error);
    throw new Error('Não foi possível gerar o PDF. Verifique se a visualização está carregada.');
  }
}

export function printInvoice(): void {
  window.print();
}
