import { createClient } from '@supabase/supabase-js';

export function makeSupabaseAdmin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Verifies the Bearer token and returns the user, or null on failure. */
export async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = makeSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function refundOcrCredit(supabase, userId) {
  const { data, error } = await supabase
    .from('user_credits')
    .select('ocr_credits')
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  const nextCredits = (data?.ocr_credits ?? 0) + 1;
  const { error: updateError } = await supabase
    .from('user_credits')
    .update({
      ocr_credits: nextCredits,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) throw updateError;
}
