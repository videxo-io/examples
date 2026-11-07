import { MAX_WEBHOOK_BYTES, readLimited } from '@/lib/limited-body';
import { type WebhookEvent, verifyWebhook } from '@/lib/videxo';

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
export async function POST(request: Request) {
  // The raw body, exactly as received: parsed and serialized again, it no longer matches the signature.
  const body = await readLimited(request, MAX_WEBHOOK_BYTES);
  if (body === null) return new Response(null, { status: 413 });
  let event: WebhookEvent;
  try {
    event = await verifyWebhook(body, request.headers);
  } catch {
    return new Response(null, { status: 400 });
  }
  const id = request.headers.get('webhook-id')!;
  if (!handled.has(id)) {
    handled.add(id);
    onJobEnded(event);
  }
  // Answer 2xx within seconds; do slow work in a queue of your own.
  return new Response(null, { status: 204 });
}
// snippet:end webhook
