const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';
const MODEL = (process.env.GEMINI_MODEL || DEFAULT_MODEL).replace(/^models\//, '');
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const INVOICE_PROMPT = `Analyze this invoice or dispatch document and extract the following as a single JSON object:

{
  "folio": "document/invoice number as shown",
  "fecha": "issue date as shown on the document (keep original format)",
  "nombre_proveedor": "supplier's legal or commercial name as shown",
  "rut_proveedor": "supplier RUT in XX.XXX.XXX-X format, empty string if not found",
  "iva": "IVA or VAT amount as shown (just the number, no currency symbol)",
  "monto_total": "total amount as shown (just the number, no currency symbol)",
  "tabla": []
}

Rules:
- For "tabla": include ONLY the main items/products/services detail table as a JSON array of objects, one object per row, keys = column headers exactly as shown. Empty array if no table found.
- Use "" for any field not found in the document.
- Return ONLY the JSON object. No explanation, no markdown code fences, nothing else.`;

export function buildGenericPrompt(includeTable, configs = []) {
  const tableInstruction = includeTable
    ? '\n- "tabla": the main line-items table as a JSON array of objects, one object per row, where keys are the column headers exactly as shown. Empty array if no table found.'
    : '';

  const configInstruction = configs.length > 0
    ? `\n- "matched_config_id": look at the "campos" you extracted and compare them against these templates. Return the "id" of the first template whose triggers all match (semantically — ignore punctuation/case differences), or null if none match.\n\nTemplates:\n${JSON.stringify(configs.map(c => ({ id: c.id, name: c.name, triggers: c.triggers })))}`
    : '\n- "matched_config_id": null';

  return `Analyze this business document and extract ALL labeled fields visible outside the main line-items table (e.g. folio, date, vendor name, RUT/RFC/tax ID, client name, address, subtotal, IVA/VAT, total, payment terms, due date, currency, order number, and any other labeled field).

Return a JSON object with:
- "campos": array where each element has exactly two keys: "campo" (field label as shown in the document) and "valor" (field value as shown). Use "" for missing values.${tableInstruction}${configInstruction}

Return ONLY the JSON object, nothing else.`;
}

export async function callGeminiWithSchema(fileData, mimeType, prompt, schema) {
  const res = await fetch(`${API_URL}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: fileData } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error Gemini HTTP ${res.status}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini no devolvió contenido.');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('No se pudo interpretar la respuesta del modelo.');
  }
}

export function buildCustomPrompt(fieldLabels, includeTable) {
  const fieldLines = fieldLabels.map(l => `  "${l}": ""`).join(',\n');
  const tableEntry = includeTable ? `,\n  "tabla": []` : '';
  return `Analyze this document and extract the following fields as a JSON object.

{
${fieldLines}${tableEntry}
}

Rules:
- Use the exact field names shown above as JSON keys.
- Extract the value of each field exactly as it appears in the document.
${includeTable ? '- For "tabla": include ONLY the main line-items table as a JSON array of objects, one object per row, where keys are the column headers exactly as shown in the document. Empty array if no table found.\n' : ''}- Use "" for any field not found in the document.
- Return ONLY the JSON object. No explanation, no markdown code fences, nothing else.`;
}

export async function callGemini(fileData, mimeType, prompt) {
  const res = await fetch(`${API_URL}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: fileData } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error Gemini HTTP ${res.status}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini no devolvió contenido. Intenta con otra imagen.');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('No se pudo interpretar la respuesta del modelo. Intenta con otra imagen.');
  }
}

export { INVOICE_PROMPT };

// ── Post-extraction prompt refinement ────────────────────────────────────────

export async function applyPostPrompt(result, instruction) {
  const prompt = `You have the following extracted document data as JSON:

${JSON.stringify(result, null, 2)}

Apply this modification to the data:
"${instruction.trim()}"

Rules:
- Return ONLY the modified JSON object with the same structure (meta, headers, rows).
- Keep all fields that were not mentioned in the instruction unchanged.
- If the modification involves a markdown table (rows/headers), preserve the markdown table format for any "tabla" field inside meta.
- Return ONLY valid JSON. No explanation, no markdown code fences, nothing else.`;

  const res = await fetch(`${API_URL}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error Gemini HTTP ${res.status}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini no devolvió contenido.');
  return JSON.parse(text);
}

// ── Table array → { headers, rows } ──────────────────────────────────────────

export function tableArrayToResult(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(arr[0]);
  const rows    = arr.map(obj => headers.map(h => String(obj[h] ?? '')));
  return { headers, rows };
}
