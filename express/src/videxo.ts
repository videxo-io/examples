import { Webhook } from 'standardwebhooks';
import jobsBody from '../requests/jobs.json' with { type: 'json' };
import transcodeBody from '../requests/transcode.json' with { type: 'json' };

// Every call this app makes to the Videxo API, with plain `fetch`. It is the only file that talks to
// Videxo: once `@videxo/sdk` is published, each function here becomes one call of the SDK and the
// rest of the app stays as it is (README, "Switch to the SDK"). Runs on the server only: it reads
// the API key.

const API_URL = process.env.VIDEXO_API_URL ?? 'https://api.videxo.io';

export type Output = {
  alias: string;
  name: string | null;
  filename: string;
  size_bytes: number | null;
  download_url: string | null;
  download_url_expires_at: string | null;
};
export type Job = {
  id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  outputs: Output[];
  error: { code: string; message: string } | null;
  metadata: Record<string, string>;
};
export type Upload = { id: string; input_url: string; upload_url: string; upload_url_expires_at: string; expires_at: string };
export type WebhookEvent = { type: 'job.succeeded' | 'job.failed' | 'job.cancelled'; timestamp: string; data: Job };

/** An RFC 9457 problem details answer: programs branch on `code` (and `reason`), people read `detail`. */
export type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  reason?: string;
  retryable?: boolean;
  request_id?: string;
  errors?: { detail: string; pointer?: string; parameter?: string; header?: string }[];
};

/** An error answer of the API, with its problem details. */
export class VidexoProblem extends Error {
  readonly problem: Problem;
  constructor(problem: Problem) {
    super(`${problem.code}: ${problem.detail}`);
    this.problem = problem;
  }
}

// snippet:start request
async function request<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const apiKey = process.env.VIDEXO_API_KEY;
  if (!apiKey) throw new Error('Set VIDEXO_API_KEY in the server environment.');
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: 'manual',
  });
  if (response.status >= 400) throw await problemOf(response);
  return (response.status >= 300 ? response.headers.get('location') : await response.json()) as T;
}

async function problemOf(response: Response): Promise<VidexoProblem> {
  const body = (await response.json().catch(() => null)) as Problem | null;
  if (body && typeof body.code === 'string') return new VidexoProblem(body);
  // Not problem details: a proxy or the network answered, not the API.
  return new VidexoProblem({
    type: 'about:blank',
    title: 'The API answered with an error.',
    status: response.status,
    detail: `HTTP ${response.status}`,
    code: 'http_error',
  });
}
// snippet:end request

/** Where Videxo sends the job's webhook: a public https URL of this app (a tunnel in development). */
const webhook = () => (process.env.VIDEXO_WEBHOOK_URL ? { webhook_url: process.env.VIDEXO_WEBHOOK_URL } : {});

// snippet:start create
/** One MP4 from one input: `POST /v1/transcode` with the body in requests/transcode.json. */
export function transcode(input: string, idempotencyKey: string): Promise<Job> {
  return request('/v1/transcode', { method: 'POST', body: { ...transcodeBody, input, ...webhook() }, idempotencyKey });
}

/** Several outputs from one input in one job: `POST /v1/jobs` with the body in requests/jobs.json. */
export function createJob(input: string, idempotencyKey: string): Promise<Job> {
  return request('/v1/jobs', { method: 'POST', body: { ...jobsBody, inputs: { talk: input }, ...webhook() }, idempotencyKey });
}
// snippet:end create

export function getJob(id: string): Promise<Job> {
  return request(`/v1/jobs/${encodeURIComponent(id)}`);
}

// snippet:start upload
/** A one-time upload URL for a file the browser sends straight to Videxo; the API key stays here. */
export function createUpload(file: { filename: string; size_bytes: number; content_type: string }): Promise<Upload> {
  return request('/v1/uploads', { method: 'POST', body: file });
}
// snippet:end upload

// snippet:start download
/** A fresh signed link to one output, from the redirect of `GET /v1/jobs/{id}/outputs/{alias}`. */
export function outputUrl(jobId: string, alias: string): Promise<string> {
  return request(`/v1/jobs/${encodeURIComponent(jobId)}/outputs/${encodeURIComponent(alias)}`);
}
// snippet:end download

// snippet:start verify
/**
 * The event when the request is a webhook Videxo signed, in the last five minutes; it throws
 * otherwise. `body` is the raw body exactly as received: parsed and serialized again, it no
 * longer matches the signature.
 */
export function verifyWebhook(body: string, headers: Record<string, string | string[] | undefined>): WebhookEvent {
  const secret = process.env.VIDEXO_WEBHOOK_SECRET;
  if (!secret) throw new Error('Set VIDEXO_WEBHOOK_SECRET in the server environment.');
  const single = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(' ') : (value ?? '')]),
  );
  return new Webhook(secret).verify(body, single) as WebhookEvent;
}
// snippet:end verify
