import { badRequest, problemResponse } from '@/lib/respond';
import { createJob, transcode } from '@/lib/videxo';

// snippet:start create-route
const UPLOAD = /^videxo:\/\/uploads\/(up_[a-f0-9]{24})$/;

export async function POST(request: Request) {
  try {
    const { kind, input_url } = await request.json();
    // Accept only uploads, so nobody can make this server fetch URLs of their choice.
    const upload = typeof input_url === 'string' ? UPLOAD.exec(input_url)?.[1] : undefined;
    if (!upload) throw badRequest('input_url must be the input_url of an upload.');
    // The same key for the same upload and kind: a retried request answers the same job, never a second one.
    const job = kind === 'jobs' ? await createJob(input_url, `jobs-${upload}`) : await transcode(input_url, `transcode-${upload}`);
    return Response.json(job, { status: 202 });
  } catch (error) {
    return problemResponse(error);
  }
}
// snippet:end create-route
