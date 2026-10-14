/**
 * Boleto PDF helper service (Caminho 2: Firestore Base64)
 */

export function base64ToBlob(base64Data: string, mimeType = 'application/pdf'): Blob {
  let base64 = base64Data;
  if (base64.includes(';base64,')) {
    const parts = base64.split(';base64,');
    mimeType = parts[0].replace(/^data:/, '') || mimeType;
    base64 = parts[1];
  }
  // Remove whitespace and newlines that break atob
  const cleaned = base64.replace(/\s/g, '');
  const byteCharacters = atob(cleaned);
  const byteNumbers = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([byteNumbers], { type: mimeType });
}

export function downloadBoletoFile(base64Data: string, fileName: string): void {
  try {
    const blob = base64ToBlob(base64Data, 'application/pdf');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'Boleto_Bancario.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  } catch (err) {
    console.error('Erro ao converter e baixar boleto:', err);
    throw new Error('Falha ao processar arquivo para download.');
  }
}

export function openBoletoInNewTab(base64Data: string): void {
  try {
    const blob = base64ToBlob(base64Data, 'application/pdf');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.error('Erro ao abrir boleto:', err);
    throw new Error('Falha ao abrir visualização do boleto.');
  }
}
