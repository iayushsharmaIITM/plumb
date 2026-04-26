import { createServiceClient } from './supabase/server';

const MAX_RUNS_PER_IP_PER_DAY = 3;

export async function checkRateLimit(
  clientIp: string
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('client_ip', clientIp)
    .eq('action', 'create_run')
    .gte('created_at', since);

  if (error) throw error;

  const used = count ?? 0;
  if (used >= MAX_RUNS_PER_IP_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }

  await supabase.from('rate_limits').insert({
    client_ip: clientIp,
    action: 'create_run',
  });

  return { allowed: true, remaining: MAX_RUNS_PER_IP_PER_DAY - used - 1 };
}
