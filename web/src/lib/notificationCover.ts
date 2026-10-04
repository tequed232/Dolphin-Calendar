/** Keep notification thumbnails small; the full cover stays in IndexedDB. */
export async function notificationCover(source: string): Promise<string | null> {
  if (!source.startsWith('data:image/')) return null;
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const context = canvas.getContext('2d');
        if (!context) return resolve(null);
        context.fillStyle = '#fff5df';
        context.fillRect(0, 0, 128, 128);
        const scale = Math.min(100 / image.width, 116 / image.height);
        const width = image.width * scale, height = image.height * scale;
        context.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
        resolve(canvas.toDataURL('image/jpeg', .72));
      } catch { resolve(null); }
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}
