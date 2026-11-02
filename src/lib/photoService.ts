/**
 * Utilitário para download da foto do medidor de energia capturada pelo cliente
 */
export const downloadMeterPhoto = (base64Data: string, fileName?: string) => {
  try {
    if (!base64Data) {
      alert('Foto não disponível para download.');
      return;
    }

    const formattedData = base64Data.startsWith('data:')
      ? base64Data
      : `data:image/jpeg;base64,${base64Data}`;

    // Extrai a extensão apropriada
    let ext = 'jpg';
    if (formattedData.startsWith('data:image/png')) ext = 'png';
    else if (formattedData.startsWith('data:image/webp')) ext = 'webp';

    const safeName = (fileName || `foto_medidor_${Date.now()}`)
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');

    const link = document.createElement('a');
    link.href = formattedData;
    link.download = `${safeName}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Erro ao realizar o download da foto do medidor:', err);
    alert('Não foi possível iniciar o download da foto. Tente novamente.');
  }
};
