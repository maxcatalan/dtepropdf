/**
 * POST /api/extract
 *
 * Public extraction endpoint — authenticated with API key.
 * Accepts both multipart/form-data (file upload) and application/json (base64).
 *
 * multipart/form-data fields:
 *   file       File     The document to extract (required)
 *   configId   string   UUID of a saved extraction config (optional)
 *
 * application/json fields:
 *   fileData   string   Base64-encoded file content (required)
 *   mimeType   string   MIME type, e.g. "image/jpeg" or "application/pdf" (required)
 *   filename   string   Original filename (optional)
 *   configId   string   UUID of a saved extraction config (optional)
 *
 * Response 200:
 *   { headers: string[], rows: string[][], meta: Record<string, string> }
 *
 * Errors: 400 missing data | 401 invalid key | 402 no credits | 500 extraction failed
 */

import { makeSupabaseAdmin, refundOcrCredit } from './_lib/supabaseAdmin.js';
import { getApiKeyUser } from './_lib/apiKeyAuth.js';
import { parseMultipart } from './_lib/parseMultipart.js';
import {
  callGemini,
  buildCustomPrompt,
  buildGenericPrompt,
  tableArrayToResult,
  applyPostPrompt,
} from './_lib/gemini.js';

// Vercel: disable built-in body parser so we can handle multipart manually
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await getApiKeyUser(req);
  if (!auth) return res.status(401).json({ error: 'Invalid or inactive API key.' });

  // ── Parse body — multipart or JSON ───────────────────────────────────────
  let fileData, mimeType, filename, configId;
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('multipart/form-data')) {
    let parsed;
    try {
      parsed = await parseMultipart(req);
    } catch (e) {
      return res.status(400).json({ error: 'Could not parse multipart body.' });
    }
    if (!parsed.file) {
      return res.status(400).json({ error: 'No file found in multipart request. Use field name "file".' });
    }
    fileData = parsed.file.data.toString('base64');
    mimeType  = parsed.file.mimeType;
    filename  = parsed.file.filename || '';
    configId  = parsed.fields.configId || undefined;
  } else {
    // JSON — body already parsed by server.js shim or Vercel (for non-multipart)
    const body = req.body ?? {};
    fileData = body.fileData;
    mimeType  = body.mimeType;
    filename  = body.filename;
    configId  = body.configId;
  }

  if (!fileData || !mimeType) {
    return res.status(400).json({ error: 'A file is required. Send multipart/form-data with a "file" field, or JSON with "fileData" + "mimeType".' });
  }

  // mode: 'quick' | 'auto' | 'manual' (default: 'auto' when configs exist, else 'quick')
  const mode = (
    contentType.includes('multipart/form-data')
      ? parsed?.fields?.mode
      : req.body?.mode
  ) ?? 'auto';

  // ── File size check ───────────────────────────────────────────────────────
  const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
  const fileSizeBytes  = Math.round((fileData.length * 3) / 4); // base64 → bytes approx
  if (fileSizeBytes > MAX_FILE_BYTES) {
    const mb = (fileSizeBytes / (1024 * 1024)).toFixed(1);
    return res.status(400).json({ error: `File too large (${mb} MB). Maximum allowed: 10 MB.` });
  }

  const supabase = makeSupabaseAdmin();

  // ── Consume OCR credit ────────────────────────────────────────────────────
  const { data: consumed, error: creditError } = await supabase.rpc('use_credit', {
    p_user_id: auth.userId,
    p_credit_type: 'ocr',
  });
  if (creditError) return res.status(500).json({ error: 'Error checking credits.' });
  if (!consumed)   return res.status(402).json({ error: 'No OCR credits available.' });

  try {
    let config         = null;
    let genericResult  = null; // reused if auto-detect already ran a generic extraction

    // ── Resolve config ────────────────────────────────────────────────────────
    if (mode === 'quick') {
      // Skip all config resolution — generic extraction only
    } else if (configId || mode === 'manual') {
      if (!configId) {
        await refundOcrCredit(supabase, auth.userId).catch(() => {});
        return res.status(400).json({ error: 'mode=manual requires a configId.' });
      }
      const { data, error } = await supabase
        .from('extraction_configs')
        .select('*')
        .eq('id', configId)
        .eq('user_id', auth.userId)
        .single();
      if (error || !data) {
        await refundOcrCredit(supabase, auth.userId).catch(() => {});
        return res.status(400).json({ error: 'Config not found or does not belong to this account.' });
      }
      config = data;
    } else {
      // mode === 'auto' (default)
      const { data: configs } = await supabase
        .from('extraction_configs')
        .select('*')
        .eq('user_id', auth.userId);

      const withTriggers = (configs ?? []).filter(c => c.triggers?.length > 0);

      if (withTriggers.length > 0) {
        // Single call: extract fields + let Gemini match config semantically
        genericResult = await callGemini(fileData, mimeType, buildGenericPrompt(true, withTriggers));
        if (genericResult.matched_config_id) {
          config = withTriggers.find(c => c.id === genericResult.matched_config_id) ?? null;
        }
      }
    }

    // ── Extract ───────────────────────────────────────────────────────────────
    let headers = [];
    let rows    = [];
    const meta  = {};

    if (config) {
      // Targeted extraction with config fields (2nd call only when a config was found)
      const fieldLabels  = (config.fields ?? []).map(f => f.label);
      const includeTable = config.show_table ?? true;
      const parsed = await callGemini(fileData, mimeType, buildCustomPrompt(fieldLabels, includeTable));

      if (includeTable && parsed.tabla) {
        ({ headers, rows } = tableArrayToResult(parsed.tabla));
      }
      for (const label of fieldLabels) {
        meta[label] = parsed[label] ?? '';
      }
    } else {
      // Reuse cached generic result if auto-detect already ran, otherwise extract now
      const result = genericResult
        ?? await callGemini(fileData, mimeType, buildGenericPrompt(true));

      for (const { campo, valor } of (result.campos ?? [])) {
        if (campo) meta[campo] = valor ?? '';
      }
      if (result.tabla?.length > 0) {
        ({ headers, rows } = tableArrayToResult(result.tabla));
      }
    }

    let result = { headers, rows, meta };

    // Apply post-prompt if configured
    if (config?.post_prompt?.trim()) {
      try {
        result = await applyPostPrompt(result, config.post_prompt);
      } catch {
        // non-fatal — return raw extraction
      }
    }

    await supabase.from('usage_log').insert({
      user_id: auth.userId,
      action: 'api_extraction',
      filename: filename || null,
    });

    return res.status(200).json(result);
  } catch (err) {
    await refundOcrCredit(supabase, auth.userId).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}

