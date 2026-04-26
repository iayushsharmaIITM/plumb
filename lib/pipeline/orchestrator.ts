export type PipelineStage =
  | 'parsing'
  | 'reranking'
  | 'simulating'
  | 'scoring'
  | 'drafting'
  | 'complete';

export async function runPipeline(
  runId: string,
  onProgress: (stage: PipelineStage) => void
): Promise<void> {
  onProgress('parsing');
  await postStage(`/api/runs/${runId}/parse`);

  onProgress('reranking');
  const rerankRes = await postStage(`/api/runs/${runId}/rerank`);
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
  const topUpRes = await postStage(`/api/runs/${runId}/top-up`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ needed }),
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
