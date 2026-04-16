import { supabase } from '../lib/supabase';

const TABLE = 'extraction_configs';
const MAX_CONFIGS = 50;

export async function listConfigs(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createConfig(userId, { name, fields, show_table, col_order, triggers, post_prompt }) {
  const { count, error: countErr } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (countErr) throw countErr;
  if (count >= MAX_CONFIGS) throw new Error(`Límite de ${MAX_CONFIGS} configuraciones alcanzado.`);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, name, fields, show_table, col_order, triggers: triggers ?? [], post_prompt: post_prompt ?? '' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateConfig(configId, userId, updates) {
  const payload = {
    updated_at: new Date().toISOString(),
  };

  if ('name' in updates) payload.name = updates.name;
  if ('fields' in updates) payload.fields = updates.fields;
  if ('show_table' in updates) payload.show_table = updates.show_table;
  if ('col_order' in updates) payload.col_order = updates.col_order;
  if ('triggers' in updates) payload.triggers = updates.triggers ?? [];
  if ('post_prompt' in updates) payload.post_prompt = updates.post_prompt ?? '';

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', configId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteConfig(configId, userId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', configId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateTriggers(configId, userId, triggers) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ triggers, updated_at: new Date().toISOString() })
    .eq('id', configId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
