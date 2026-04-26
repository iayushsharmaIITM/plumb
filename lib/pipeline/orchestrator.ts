export type PipelineStage =
  | 'parsing'
  | 'reranking'
  | 'simulating'
  | 'scoring'
  | 'drafting'
  | 'complete';

export interface BrowserTalentDatabase {
  name: string;
  candidate_count: number;
  source_type?: string;
  candidates: unknown[];
}

export function browserTalentDatabaseStorageKey(runId: string): string {
  return `plumb:run-talent-database:${runId}`;
}

export async function runPipeline(
  runId: string,
  onProgress: (stage: PipelineStage) => void
): Promise<void> {
  onProgress('parsing');
  await postStage(`/api/runs/${runId}/parse`);

  onProgress('reranking');
  const talentDatabase = loadBrowserTalentDatabase(runId);
  const rerankRes = await postStage(
    `/api/runs/${runId}/rerank`,
    talentDatabase ? jsonBody({ talent_database: talentDatabase }) : undefined
  );
  const { candidate_ids } = (await rerankRes.json()) as { candidate_ids: string[] };

  onProgress('simulating');
  await Promise.all(
    candidate_ids.map((cid) =>
      postStage(`/api/runs/${runId}/candidates/${cid}/simulate`)
    )
  );

  onProgress('scoring');
  await Promise.all(
    candidate_ids.map((cid) =>
      postStage(`/api/runs/${runId}/candidates/${cid}/score`)
    )
  );

  onProgress('drafting');
  await Promise.all(
    candidate_ids.map((cid) =>
      postStage(`/api/runs/${runId}/candidates/${cid}/draft`)
    )
  );

  await fetch(`/api/runs/${runId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'complete' }),
  });
  onProgress('complete');
}

export async function topUpPipeline(
  runId: string,
  needed: number,
  onProgress: (stage: PipelineStage) => void
): Promise<string[]> {
  onProgress('reranking');
  const talentDatabase = loadBrowserTalentDatabase(runId);
  const topUpRes = await postStage(`/api/runs/${runId}/top-up`, {
    ...jsonBody({
      needed,
      ...(talentDatabase ? { talent_database: talentDatabase } : {}),
    }),
  });
  const { candidate_ids } = (await topUpRes.json()) as { candidate_ids: string[] };

  onProgress('simulating');
  await Promise.all(
    candidate_ids.map((cid) =>
      postStage(`/api/runs/${runId}/candidates/${cid}/simulate`)
    )
  );

  onProgress('scoring');
  await Promise.all(
    candidate_ids.map((cid) =>
      postStage(`/api/runs/${runId}/candidates/${cid}/score`)
    )
  );

  onProgress('drafting');
  await Promise.all(
    candidate_ids.map((cid) =>
      postStage(`/api/runs/${runId}/candidates/${cid}/draft`)
    )
  );

  await fetch(`/api/runs/${runId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'complete', error_message: null }),
  });
  onProgress('complete');

  return candidate_ids;
}

async function postStage(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { method: 'POST', ...init });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stage ${url} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res;
}

function jsonBody(body: Record<string, unknown>): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function loadBrowserTalentDatabase(runId: string): BrowserTalentDatabase | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(browserTalentDatabaseStorageKey(runId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BrowserTalentDatabase>;
    if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) return null;
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Browser uploaded database',
      candidate_count: typeof parsed.candidate_count === 'number'
        ? parsed.candidate_count
        : parsed.candidates.length,
      source_type: typeof parsed.source_type === 'string' ? parsed.source_type : 'browser_upload',
      candidates: parsed.candidates,
    };
  } catch {
    return null;
  }
}
