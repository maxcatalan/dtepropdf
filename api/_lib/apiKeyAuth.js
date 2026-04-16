import { makeSupabaseAdmin } from './supabaseAdmin.js';
import { createHash } from 'crypto';

/** Hash a raw API key with SHA-256 (hex). */
export function hashKey(rawKey) {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Validate an API key from the Authorization header.
 * Returns { userId, keyId } or null if invalid/inactive.
 */
export async function getApiKeyUser(req) {
  const raw = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!raw?.startsWith('sk_live_')) return null;

  const hash = hashKey(raw);
  const supabase = makeSupabaseAdmin();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active')
    .eq('key_hash', hash)
    .single();

  if (error || !data || !data.is_active) return null;

  // Update last_used_at in background (non-blocking)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return { userId: data.user_id, keyId: data.id };
}
