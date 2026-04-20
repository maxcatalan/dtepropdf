-- Atomic credit refund helper used when an OCR/API request fails after consuming a credit.
create or replace function public.refund_credit(
  p_user_id uuid,
  p_credit_type text -- 'ocr' | 'xml'
)
returns boolean
language plpgsql
security definer
as $$
begin
  if p_credit_type = 'ocr' then
    update public.user_credits
       set ocr_credits = coalesce(ocr_credits, 0) + 1,
           updated_at = now()
     where user_id = p_user_id;
    return found;
  elsif p_credit_type = 'xml' then
    update public.user_credits
       set xml_credits = coalesce(xml_credits, 0) + 1,
           updated_at = now()
     where user_id = p_user_id;
    return found;
  end if;

  return false;
end;
$$;
