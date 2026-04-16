import { extractTableWithGemini } from './geminiOcr';

// Returns { headers, rows, meta }
export async function extractTableFromFile(file, options = {}) {
  return extractTableWithGemini(file, options.session);
}

/**
 * Convierte { headers, rows } a formato CSV string
 */
export function tableToCSV(headers, rows) {
  const escape = (val) => {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => headers.map((_, i) => escape(row[i])).join(',')),
  ];
  return lines.join('\r\n');
}

/**
 * Descarga un string como archivo
 */
export function downloadText(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
