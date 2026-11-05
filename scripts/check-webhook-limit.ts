// Run against any example's /webhooks/videxo route, with its signing secret in the environment, from
// the folder that holds the examples (Node 22.18 or newer runs it directly):
// WEBHOOK_URL=http://127.0.0.1:<port>/webhooks/videxo VIDEXO_WEBHOOK_SECRET=... node scripts/check-webhook-limit.ts
// This sends only test events. No API key or running Videxo API is needed.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const url = new URL(process.env.WEBHOOK_URL ?? '');
assert(['http:', 'https:'].includes(url.protocol), 'WEBHOOK_URL must be http or https.');
const secret = process.env.VIDEXO_WEBHOOK_SECRET;
assert(secret, 'Set the same VIDEXO_WEBHOOK_SECRET as the example server.');
const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
const max = 2_097_152;

function event(size: number): Buffer {
  const payload = {
    type: 'job.failed',
    timestamp: new Date().toISOString(),
    data: { id: 'job_body_limit_test', outputs: [], padding: '' },
  };
  payload.data.padding = 'x'.repeat(size - Buffer.byteLength(JSON.stringify(payload)));
  const body = Buffer.from(JSON.stringify(payload));
  assert.equal(body.length, size);
  return body;
}

async function send(body: Buffer, chunked: boolean): Promise<number> {
  const id = `msg_${randomBytes(12).toString('hex')}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest('base64');
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'webhook-id': id,
          'webhook-timestamp': timestamp,
          'webhook-signature': `v1,${signature}`,
          ...(chunked ? { 'transfer-encoding': 'chunked' } : { 'content-length': String(body.length) }),
        },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode!));
      },
    );
    request.once('error', reject);
    request.setTimeout(15_000, () => request.destroy(new Error('The webhook request timed out.')));
    if (chunked) {
      for (let offset = 0; offset < body.length; offset += 65_536) request.write(body.subarray(offset, offset + 65_536));
      request.end();
    } else {
      request.end(body);
    }
  });
}

for (const chunked of [false, true]) {
  for (const size of [max, max + 1]) {
    const expected = size === max ? 204 : 413;
    const status = await send(event(size), chunked);
    const label = `${chunked ? 'chunked' : 'Content-Length'}, ${size} bytes`;
    assert.equal(status, expected, label);
    console.log(`${label}: ${status}`);
  }
}
