import { makeSupabaseAdmin, getUser } from './_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const supabase = makeSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_credits')
      .select('api_mode')
      .eq('user_id', user.id)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ api_mode: data?.api_mode ?? 'auto' });
  }

  if (req.method === 'PATCH') {
    const { api_mode } = req.body ?? {};
    if (!['quick', 'auto', 'manual'].includes(api_mode)) {
      return res.status(400).json({ error: 'Invalid api_mode.' });
    }
    const { error } = await supabase
      .from('user_credits')
      .update({ api_mode, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ api_mode });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
