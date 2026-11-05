import { type Actions, fail } from '@sveltejs/kit';
import { VidexoProblem, createJob, transcode } from '#lib/server/videxo.ts';

// snippet:start action
const UPLOAD = /^videxo:\/\/uploads\/(up_[a-f0-9]{24})$/;

export const actions = {
  // The browser has already uploaded the file; the form carries the upload's input_url.
  default: async ({ request }) => {
    const form = await request.formData();
    const inputUrl = String(form.get('input_url') ?? '');
    // Accept only uploads, so nobody can make this server fetch URLs of their choice.
    const upload = UPLOAD.exec(inputUrl)?.[1];
    if (!upload) return fail(400, { problem: { title: 'The request is not valid.', detail: 'Upload a file first.' } });
    try {
      // The same key for the same upload and kind: a retried submit answers the same job, never a second one.
      const job =
        form.get('kind') === 'jobs' ? await createJob(inputUrl, `jobs-${upload}`) : await transcode(inputUrl, `transcode-${upload}`);
      return { job };
    } catch (error) {
      if (error instanceof VidexoProblem) return fail(error.problem.status, { problem: error.problem });
      throw error;
    }
  },
} satisfies Actions;
// snippet:end action
