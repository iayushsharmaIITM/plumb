import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log(`Checking ${url}\n`);
  const tables = ['runs', 'candidates', 'conversations', 'api_calls', 'rate_limits'] as const;
  const views = ['candidates_public'] as const;
  let ok = true;

  for (const t of tables) {
    // `head: true` count queries sometimes succeed against missing tables due to cache;
    // probe with a real limit(1) that forces a row read.
    const { error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`✗ table ${t} — ${error.message}`);
      ok = false;
    } else {
      console.log(`✓ table ${t} — reachable`);
    }
  }

  for (const v of views) {
    const { error } = await supabase.from(v).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`✗ view ${v} — ${error.message}`);
      ok = false;
    } else {
      console.log(`✓ view ${v} — reachable`);
    }
  }

  const { error: decisionColumnError } = await supabase
    .from('candidates')
    .select('review_decision, reviewed_at')
    .limit(1);
  if (decisionColumnError) {
    console.log(`✗ candidate review columns — ${decisionColumnError.message}`);
    ok = false;
  } else {
    console.log('✓ candidate review columns — reachable');
  }

  // Realtime publication
  const { error: pubErr } = await supabase.rpc('pg_realtime_publication_check' as never).single();
  if (pubErr && !pubErr.message.includes('does not exist')) {
    console.log(`(realtime publication check skipped — no helper RPC)`);
  }

  if (!ok) {
    console.log('\nMigrations have NOT been applied. Paste supabase/migrations/all.sql into the Supabase SQL Editor.');
    process.exit(1);
  }
  console.log('\nAll tables + view reachable.');
}

main().catch((e) => { console.error(e); process.exit(1); });
