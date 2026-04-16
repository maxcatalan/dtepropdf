import { randomBytes, createHash } from 'crypto';
import { makeSupabaseAdmin, getUser } from './_lib/supabaseAdmin.js';

function generateRawKey() {
  return 'sk_live_' + randomBytes(24).toString('base64url');
}

function hashKey(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const supabase = makeSupabaseAdmin();

  // ── POST: create key ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { name } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

    const raw = generateRawKey();
    const hash = hashKey(raw);
    const prefix = raw.slice(0, 16); // "sk_live_" + 8 chars

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: name.trim(),
        key_hash: hash,
        key_prefix: prefix,
      })
      .select('id, name, key_prefix, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // raw_key returned ONCE — never stored plain
    return res.status(201).json({ ...data, raw_key: raw });
  }

  // ── DELETE: revoke key ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const keyId = req.query.id;
    if (!keyId) return res.status(400).json({ error: 'id is required.' });

    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', keyId)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
