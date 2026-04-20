import { makeSupabaseAdmin, getUser, refundOcrCredit } from './_lib/supabaseAdmin.js';
import { callGemini, buildCustomPrompt, buildGenericPrompt, tableArrayToResult, applyPostPrompt } from './_lib/gemini.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { fileData, mimeType, filename, fieldLabels = [], includeTable = true, genericMeta = false, postPrompt = '' } = req.body ?? {};
  if (!fileData || !mimeType) {
    return res.status(400).json({ error: 'Faltan datos del archivo' });
  }

  const supabase = makeSupabaseAdmin();
  const { data: consumed, error: creditError } = await supabase.rpc('use_credit', {
    p_user_id: user.id,
    p_credit_type: 'ocr',
  });
  if (creditError) return res.status(500).json({ error: 'Error verificando créditos' });
  if (!consumed)   return res.status(402).json({ error: 'Sin créditos OCR disponibles' });

  try {
    let headers = [];
    let rows    = [];
    const meta  = {};

    if (genericMeta) {
      const result = await callGemini(fileData, mimeType, buildGenericPrompt(includeTable));
      for (const { campo, valor } of (result.campos ?? [])) {
        if (campo) meta[campo] = valor ?? '';
      }
      if (includeTable && result.tabla?.length > 0) {
        ({ headers, rows } = tableArrayToResult(result.tabla));
      }
    } else {
      const parsed = await callGemini(fileData, mimeType, buildCustomPrompt(fieldLabels, includeTable));
      if (includeTable && parsed.tabla) {
        ({ headers, rows } = tableArrayToResult(parsed.tabla));
      }
      for (const label of fieldLabels) {
        meta[label] = parsed[label] || '';
      }
    }

    let finalResult = { headers, rows, meta };
    if (postPrompt?.trim()) {
      try {
        finalResult = await applyPostPrompt(finalResult, postPrompt);
      } catch {
        // post-prompt failure is non-fatal — return raw extraction
      }
    }

    await supabase.from('usage_log').insert({
      user_id: user.id,
      action: 'custom_extraction',
      filename: filename || null,
    });

    return res.status(200).json(finalResult);
  } catch (err) {
    await refundOcrCredit(supabase, user.id).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
