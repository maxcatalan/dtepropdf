import { makeSupabaseAdmin, getUser, refundOcrCredit } from './_lib/supabaseAdmin.js';
import { callGemini, INVOICE_PROMPT, tableArrayToResult } from './_lib/gemini.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // Auth
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { fileData, mimeType, filename } = req.body ?? {};
  if (!fileData || !mimeType) {
    return res.status(400).json({ error: 'Faltan datos del archivo' });
  }

  // Check + atomically decrement credit
  const supabase = makeSupabaseAdmin();
  const { data: consumed, error: creditError } = await supabase.rpc('use_credit', {
    p_user_id: user.id,
    p_credit_type: 'ocr',
  });
  if (creditError) return res.status(500).json({ error: 'Error verificando créditos' });
  if (!consumed)   return res.status(402).json({ error: 'Sin créditos OCR disponibles' });

  try {
    const parsed = await callGemini(fileData, mimeType, INVOICE_PROMPT);

    const { headers, rows } = tableArrayToResult(parsed.tabla);

    await supabase.from('usage_log').insert({
      user_id: user.id,
      action: 'ocr_extraction',
      filename: filename || null,
    });

    return res.status(200).json({
      headers,
      rows,
      meta: {
        folio:            parsed.folio            || '',
        fecha:            parsed.fecha            || '',
        nombre_proveedor: parsed.nombre_proveedor || '',
        rut_proveedor:    parsed.rut_proveedor    || '',
        iva:              parsed.iva              || '',
        monto_total:      parsed.monto_total      || '',
      },
    });
  } catch (err) {
    await refundOcrCredit(supabase, user.id).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
