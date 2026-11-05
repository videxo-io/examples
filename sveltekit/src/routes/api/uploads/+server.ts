import type { RequestHandler } from '@sveltejs/kit';
import { problemResponse } from '#lib/server/respond.ts';
import { createUpload } from '#lib/server/videxo.ts';

// snippet:start upload-route
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { filename, size_bytes, content_type } = await request.json();
    const upload = await createUpload({ filename, size_bytes, content_type });
    // Only the one-time URL goes to the browser; it holds no API key.
    return Response.json({ input_url: upload.input_url, upload_url: upload.upload_url }, { status: 201 });
  } catch (error) {
    return problemResponse(error);
  }
};
// snippet:end upload-route
