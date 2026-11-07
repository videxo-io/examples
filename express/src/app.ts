import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler, type Request } from 'express';
import {
  type WebhookEvent,
  VidexoProblem,
  createJob,
  createUpload,
  followToken,
  getJob,
  outputUrl,
  refreshToken,
  transcode,
  uploadToken,
  verifyWebhook,
} from './videxo.ts';

// The app's routes: the page in public/ uploads a file straight to Videxo with an upload URL this
// server makes, then asks the server to create a job and reads it until it ends. Videxo calls
// /webhooks/videxo when the job ends. The API key and the webhook secret never leave the server.

export const app = express();

/** Webhook ids already handled. Keep them in your database (a unique column) so a retry is skipped after a restart too. */
const handled = new Set<string>();

function onJobEnded(event: WebhookEvent) {
  // Your code: mark the order done, store the outputs' names, email the customer.
  console.log(
    event.type,
    event.data.id,
    event.data.outputs.map((output) => output.filename),
  );
}

// snippet:start webhook
// The webhook route reads the raw body: it is registered before express.json(), which would parse it.
// The body is the whole job and can pass express's default limit of 100 KB, so it allows 2 MB.
app.post('/webhooks/videxo', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  let event: WebhookEvent;
  try {
    event = await verifyWebhook(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '', req.headers);
  } catch {
    res.status(400).end();
    return;
  }
  const id = req.header('webhook-id')!;
  if (!handled.has(id)) {
    handled.add(id);
    onJobEnded(event);
  }
  // Answer 2xx within seconds; do slow work in a queue of your own.
  res.status(204).end();
});
// snippet:end webhook

app.use(express.json());
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));

/** The problem details this app answers for a request it refuses itself. */
const badRequest = (detail: string) =>
  new VidexoProblem({ type: 'about:blank', title: 'The request is not valid.', status: 400, detail, code: 'invalid_request' });

// snippet:start upload-route
app.post('/api/uploads', async (req, res) => {
  const { filename, size_bytes, content_type } = req.body ?? {};
  const upload = await createUpload({ filename, size_bytes, content_type });
  // Only the one-time URL goes to the browser; it holds no API key.
  res.status(201).json({ input_url: upload.input_url, upload_url: upload.upload_url });
});
// snippet:end upload-route

// snippet:start create-route
const UPLOAD = /^videxo:\/\/uploads\/(up_[a-f0-9]{24})$/;

app.post('/api/jobs', async (req, res) => {
  const { kind, input_url } = req.body ?? {};
  // Accept only uploads, so nobody can make this server fetch URLs of their choice.
  const upload = typeof input_url === 'string' ? UPLOAD.exec(input_url)?.[1] : undefined;
  if (!upload) throw badRequest('input_url must be the input_url of an upload.');
  // The same key for the same upload and kind: a retried request answers the same job, never a second one.
  const job = kind === 'jobs' ? await createJob(input_url, `jobs-${upload}`) : await transcode(input_url, `transcode-${upload}`);
  res.status(202).json(job);
});
// snippet:end create-route

app.get('/api/jobs/:id', async (req, res) => {
  res.json(await getJob(req.params.id));
});

// snippet:start client-token-route
// For an app that holds a client token instead of asking this server for each step.

/**
 * The signed-in user, from your own sign-in. This example has none, so it refuses everyone: replace
 * the lookup with your session or JWT check. VIDEXO_EXAMPLE_TEST_SESSIONS (JSON, a session to its
 * user) is there for the example's own test and for trying it locally; never set it in production.
 */
function currentUser(req: Request): string {
  const sessions = JSON.parse(process.env.VIDEXO_EXAMPLE_TEST_SESSIONS ?? '{}') as Record<string, string>;
  const session = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
  if (session && Object.hasOwn(sessions, session)) return sessions[session]!;
  throw new VidexoProblem({
    type: 'about:blank',
    title: 'Sign in first.',
    status: 401,
    detail: 'This route needs a signed-in user.',
    code: 'authentication_failed',
  });
}

/** The chains of tokens this server minted, by token id. Keep them in your database, so they outlive a restart. */
type Chain = { user: string; following: boolean };
const chains = new Map<string, Chain>();

/** The chain of a token id, only for the user it was minted for; any other answer is the same as an unknown id. */
function chainOf(tokenId: unknown, user: string): Chain {
  const chain = typeof tokenId === 'string' ? chains.get(tokenId) : undefined;
  if (chain?.user === user) return chain;
  throw new VidexoProblem({ type: 'about:blank', title: 'Not found.', status: 404, detail: 'No such client token.', code: 'not_found' });
}

// No `continues`: a new upload token for this user. With it: the next token of the user's own chain.
app.post('/api/client-tokens', async (req, res) => {
  const user = currentUser(req);
  const { continues } = req.body ?? {};
  const chain = continues === undefined ? { user, following: false } : chainOf(continues, user);
  const minted = continues === undefined ? await uploadToken(user) : await refreshToken(continues, chain.following);
  chains.set(minted.id, chain);
  res.status(201).json({ id: minted.id, token: minted.token, expires_at: minted.expires_at });
});

// Creates the job from the user's upload, and answers its id with a continuation that may read it. The
// app never names a job: this server made this one, so it is the user's.
app.post('/api/client-tokens/jobs', async (req, res) => {
  const chain = chainOf(req.body?.continues, currentUser(req));
  const { continues, input_url } = req.body;
  const upload = typeof input_url === 'string' ? UPLOAD.exec(input_url)?.[1] : undefined;
  if (!upload) throw badRequest('input_url must be the input_url of an upload.');
  const job = await transcode(input_url, `transcode-${upload}`);
  const minted = await followToken(continues, job.id);
  chain.following = true;
  chains.set(minted.id, chain);
  res.status(201).json({ job_id: job.id, id: minted.id, token: minted.token, expires_at: minted.expires_at });
});
// snippet:end client-token-route

// snippet:start download-route
app.get('/api/jobs/:id/outputs/:alias', async (req, res) => {
  // A fresh link each time: signed links expire within an hour.
  res.redirect(302, await outputUrl(req.params.id, req.params.alias));
});
// snippet:end download-route

// snippet:start errors
// Express 5 sends a rejected handler here. Videxo's problem details go to the page as they came, so
// it can show `detail` and the field errors; a body the parsers refuse keeps their 4xx; anything else is a plain 500.
const onError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof VidexoProblem) {
    res.status(error.problem.status).type('application/problem+json').send(JSON.stringify(error.problem));
    return;
  }
  // express.raw() and express.json() refuse a body past their limit with 413, a broken one with 400.
  if (typeof error?.status === 'number' && error.status >= 400 && error.status < 500) {
    res.status(error.status).end();
    return;
  }
  console.error(error);
  res
    .status(500)
    .type('application/problem+json')
    .send(JSON.stringify({ title: 'Something went wrong.', status: 500 }));
};
app.use(onError);
// snippet:end errors
