import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { SEEDED_DATABASE_ID, normalizeUploadedCandidates } from '@/lib/talent-database';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SEEDED_DATABASE = {
  id: SEEDED_DATABASE_ID,
  name: 'Seeded ATS + portfolio corpus',
  candidate_count: 120,
  source_type: 'seeded',
  created_at: null,
};

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('talent_databases')
      .select('id, name, candidate_count, source_type, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({
        databases: [SEEDED_DATABASE],
        schema_ready: false,
        warning: 'Apply supabase/migrations/005_talent_databases.sql to enable uploads.',
      });
    }

    return NextResponse.json({
      databases: [SEEDED_DATABASE, ...(data ?? [])],
      schema_ready: true,
    });
  } catch {
    return NextResponse.json({
      databases: [SEEDED_DATABASE],
      schema_ready: false,
      warning: 'Production environment is not configured for database uploads yet.',
    });
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string; candidates?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const name = body.name?.trim() || `Uploaded database ${new Date().toISOString().slice(0, 10)}`;
  const rawCandidates = Array.isArray(body.candidates) ? body.candidates : [];
  if (rawCandidates.length === 0) {
    return NextResponse.json({ error: 'Upload must include at least one candidate.' }, { status: 400 });
  }
  if (rawCandidates.length > 500) {
    return NextResponse.json({ error: 'Upload limit is 500 candidates per database.' }, { status: 400 });
  }

  const normalized = normalizeUploadedCandidates(rawCandidates);
  const unique = new Map(normalized.map((candidate) => [candidate.profile.id, candidate]));
  const candidates = Array.from(unique.values());

  try {
    const supabase = createServiceClient();
    const { data: database, error: dbError } = await supabase
      .from('talent_databases')
      .insert({
        name,
        candidate_count: candidates.length,
        source_type: 'upload',
      })
      .select('id, name, candidate_count, source_type, created_at')
      .single();

    if (dbError || !database) {
      throw new Error(dbError?.message ?? 'database insert failed');
    }

    const { error: candidateError } = await supabase
      .from('talent_database_candidates')
      .insert(candidates.map((candidate) => ({
        database_id: database.id,
        pool_candidate_id: candidate.profile.id,
        profile_json: candidate.profile,
        persona_hidden_state: candidate.hiddenState,
      })));

    if (candidateError) {
      await supabase.from('talent_databases').delete().eq('id', database.id);
      throw new Error(candidateError.message);
    }

    return NextResponse.json({ database });
  } catch (error) {
    const message = (error as Error).message;
    const missingSchema =
      message.includes('talent_databases') ||
      message.includes('talent_database_candidates') ||
      message.includes('schema cache');
    return NextResponse.json({
      error: missingSchema
        ? 'Talent database tables are missing; apply supabase/migrations/005_talent_databases.sql.'
        : message,
    }, { status: missingSchema ? 409 : 500 });
  }
}
