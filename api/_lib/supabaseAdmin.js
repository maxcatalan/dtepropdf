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
  const { error } = await supabase.rpc('refund_credit', {
    p_user_id: userId,
    p_credit_type: 'ocr',
  });

  if (error) throw error;
}
