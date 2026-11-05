// The raw body of a request, or null when it is longer than `limit` bytes: the Content-Length is
// checked first, and the stream is never read past `limit` + 1 bytes. A webhook body is the whole
// job, up to several hundred KB, so the webhook route allows 2 MB.

export const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;

export async function readLimited(request: Request, limit: number): Promise<string | null> {
  const length = request.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
