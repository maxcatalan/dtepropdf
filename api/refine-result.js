import { getUser } from './_lib/supabaseAdmin.js';
import { applyPostPrompt } from './_lib/gemini.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { currentResult, instruction } = req.body ?? {};
  if (!currentResult || !instruction?.trim()) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const parsed = await applyPostPrompt(currentResult, instruction);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
