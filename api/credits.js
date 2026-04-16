import { makeSupabaseAdmin, getUser } from './_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const supabase = makeSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_credits')
    .select('ocr_credits, xml_credits')
    .eq('user_id', user.id)
    .single();

  if (error) return res.status(500).json({ error: 'Error obteniendo créditos' });

  return res.status(200).json(data ?? { ocr_credits: 0, xml_credits: 0 });
}
