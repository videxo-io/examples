import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import { type WebhookEvent, VidexoProblem, createJob, createUpload, getJob, outputUrl, transcode, verifyWebhook } from './videxo.ts';

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
app.post('/webhooks/videxo', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  let event: WebhookEvent;
  try {
    event = verifyWebhook(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '', req.headers);
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
