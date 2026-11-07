import { VIDEXO_API_KEY, VIDEXO_API_URL, VIDEXO_WEBHOOK_SECRET, VIDEXO_WEBHOOK_URL } from '$app/env/private';
import {
  type Job,
  type JobRequest,
  type TranscodeRequest,
  type Upload,
  type WebhookEvent,
  Videxo,
  VidexoError,
  verifyWebhook as verifySignature,
} from '@videxo/sdk';
import jobsBody from '../../../requests/jobs.json';
import transcodeBody from '../../../requests/transcode.json';

// Every call this app makes to the Videxo API, with `@videxo/sdk`. It is the only file that talks to
// Videxo; the rest of the app imports these functions. It sits in a `server` folder, so SvelteKit
// refuses to bundle it into browser code: it reads the API key.

export type { Job, Upload, WebhookEvent };

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

/** An error answer, with its problem details: the API's own, or this app's for a request it refuses. */
export class VidexoProblem extends Error {
  readonly problem: Problem;
  constructor(problem: Problem) {
    super(`${problem.code}: ${problem.detail}`);
    this.problem = problem;
  }
}

// snippet:start request
let client: Videxo | undefined;

/** The SDK's client, made on the first call: it retries a 429, a 5xx it may and a network error. */
function videxo(): Videxo {
  client ??= new Videxo({ apiKey: VIDEXO_API_KEY, baseUrl: VIDEXO_API_URL });
  return client;
}

/** The call's answer; a `VidexoError` becomes a `VidexoProblem` with the API's problem details as they came. */
async function call<T>(send: (videxo: Videxo) => Promise<T>): Promise<T> {
  try {
    return await send(videxo());
  } catch (error) {
    if (!(error instanceof VidexoError)) throw error;
    const body = error.body as Problem | undefined;
    if (typeof body === 'object' && body !== null && typeof body.code === 'string') throw new VidexoProblem(body);
    // No problem details: the network, a timeout or a proxy answered, not the API.
    throw new VidexoProblem({
      type: 'about:blank',
      title: error.title,
      status: error.status ?? 502,
      detail: error.detail,
      code: error.code,
    });
  }
}
// snippet:end request

/** Where Videxo sends the job's webhook: a public https URL of this app (a tunnel in development). */
const webhook = () => (VIDEXO_WEBHOOK_URL ? { webhook_url: VIDEXO_WEBHOOK_URL } : {});

// snippet:start create
/** One MP4 from one input: `POST /v1/transcode` with the body in requests/transcode.json. */
export function transcode(input: string, idempotencyKey: string): Promise<Job> {
  const body = { ...transcodeBody, input, ...webhook() } as TranscodeRequest;
  return call((videxo) => videxo.transcode(body, { idempotencyKey }));
}

/** Several outputs from one input in one job: `POST /v1/jobs` with the body in requests/jobs.json. */
export function createJob(input: string, idempotencyKey: string): Promise<Job> {
  const body = { ...jobsBody, inputs: { talk: input }, ...webhook() } as JobRequest;
  return call((videxo) => videxo.jobs.create(body, { idempotencyKey }));
}
// snippet:end create

export function getJob(id: string): Promise<Job> {
  return call((videxo) => videxo.jobs.get(id));
}

// snippet:start upload
/** A one-time upload URL for a file the browser sends straight to Videxo; the API key stays here. */
export function createUpload(file: { filename: string; size_bytes: number; content_type: string }): Promise<Upload> {
  return call((videxo) => videxo.uploads.create(file));
}
// snippet:end upload

// snippet:start download
/** A fresh signed link to one output, from the redirect of `GET /v1/jobs/{id}/outputs/{alias}`. */
export function outputUrl(jobId: string, alias: string): Promise<string> {
  return call((videxo) => videxo.outputs.url(jobId, alias));
}
// snippet:end download

// snippet:start verify
/**
 * The event when the request is a webhook Videxo signed, in the last five minutes; it throws
 * otherwise. `body` is the raw body exactly as received: parsed and serialized again, it no
 * longer matches the signature.
 */
export function verifyWebhook(body: string, headers: Headers): Promise<WebhookEvent> {
  return verifySignature(body, headers, VIDEXO_WEBHOOK_SECRET);
}
// snippet:end verify
