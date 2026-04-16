// Client-side OCR service — compresses the file, then calls the server-side proxy.
// The Gemini API key never reaches the browser.

export async function extractTableWithGemini(file, session) {
  const { data: fileData, mimeType } = await fileToBase64(file);

  const res = await fetch('/api/gemini-ocr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ fileData, mimeType, filename: file.name }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 402) throw new Error('Sin créditos OCR disponibles. Adquiere más extracciones para continuar.');
    if (res.status === 401) throw new Error('Sesión expirada. Recarga la página.');
    throw new Error(err.error || `Error HTTP ${res.status}`);
  }

  return res.json();
}

// ── File helpers (compression stays client-side to reduce payload size) ──────

async function fileToBase64(file) {
  const mimeType = getMimeType(file);
  if (mimeType === 'application/pdf') {
    return { data: await readAsBase64(file), mimeType };
  }
  return compressImage(file, 2000, 0.82);
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width  = Math.round(width  * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function getMimeType(file) {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = file.name.toLowerCase().split('.').pop();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[ext] || 'image/jpeg';
}
