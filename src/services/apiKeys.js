import { supabase } from '../lib/supabase';

const TABLE = 'api_keys';

export async function listApiKeys(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, key_prefix, is_active, created_at, last_used_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Creates a key server-side via the dedicated endpoint (raw key is only returned once). */
export async function createApiKey(session, name) {
  const res = await fetch('/api/api-keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error HTTP ${res.status}`);
  }
  return res.json(); // { id, name, key_prefix, raw_key, created_at }
}

export async function revokeApiKey(session, keyId) {
  const res = await fetch(`/api/api-keys?id=${keyId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error HTTP ${res.status}`);
  }
}
