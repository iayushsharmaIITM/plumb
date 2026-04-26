import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const { data, error } = await supabase
    .from('runs')
    .insert({ jd_text: 'SMOKE TEST — safe to delete', status: 'pending' })
    .select()
    .single();
  if (error) {
    console.log('INSERT failed:', error.message);
    console.log('→ migrations likely NOT applied. Run all.sql in Supabase SQL Editor.');
    process.exit(1);
  }
  console.log('INSERT ok, id=', data.id);
  const { error: delErr } = await supabase.from('runs').delete().eq('id', data.id);
  if (delErr) { console.log('DELETE failed:', delErr.message); process.exit(1); }
  console.log('DELETE ok. Schema is live.');
}

main().catch((e) => { console.error(e); process.exit(1); });
