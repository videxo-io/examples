<script lang="ts">
  import { type SubmitFunction, enhance } from '$app/forms';
  import { resolve } from '$app/paths';

  // The browser side: it never sees the API key. It asks /api/uploads for an upload URL, PUTs the
  // file there, then submits the form, whose action creates the job, and reads the job every 2
  // seconds until it ends.

  type Job = { id: string; state: string; outputs: { alias: string; filename: string }[]; error: { code: string; message: string } | null };
  type Problem = { title?: string; detail?: string; errors?: { detail: string; pointer?: string }[] };

  let status = $state('');
  let job = $state<Job | null>(null);
  let problem = $state<Problem | null>(null);

  /** A plain filename as the API wants it: letters, digits, dots, underscores and hyphens. */
  const plainName = (name: string) =>
    name
      .replace(/[^A-Za-z0-9_.-]+/g, '-')
      .replace(/^[^A-Za-z0-9]+/, '')
      .slice(-100) || 'upload.bin';

  async function readJson<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw (body ?? { title: 'The app answered with an error.', detail: `HTTP ${response.status}` }) as Problem;
    return body as T;
  }

  // snippet:start client
  const upload: SubmitFunction = async ({ formData, cancel }) => {
    problem = null;
    job = null;
    const file = formData.get('file') as File;
    const contentType = file.type || 'application/octet-stream';
    try {
      status = 'Creating the upload';
      const created = await readJson<{ input_url: string; upload_url: string }>(
        await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: plainName(file.name), size_bytes: file.size, content_type: contentType }),
        }),
      );
      status = 'Uploading';
      // Straight to Videxo with the one-time URL: no API key, and the file never passes through this app.
      await readJson(await fetch(created.upload_url, { method: 'PUT', headers: { 'content-type': contentType }, body: file }));
      // The action gets the upload's input_url, not the file.
      formData.delete('file');
      formData.set('input_url', created.input_url);
    } catch (error) {
      status = '';
      problem = error as Problem;
      cancel();
      return;
    }
    return async ({ result }) => {
      if (result.type === 'failure') {
        status = '';
        problem = (result.data?.problem as Problem) ?? { title: 'The job was not created.' };
        return;
      }
      if (result.type !== 'success') return;
      let current = result.data?.job as Job;
      while (current.state === 'queued' || current.state === 'running') {
        status = `Job ${current.id}: ${current.state}`;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        current = await readJson<Job>(await fetch(`/api/jobs/${current.id}`));
      }
      status = `Job ${current.id}: ${current.state}`;
      job = current;
    };
  };
  // snippet:end client
</script>

<svelte:head>
  <title>Videxo example</title>
</svelte:head>

<main>
  <h1>Videxo example</h1>
  <p>Pick a file: the browser uploads it to Videxo with a one-time URL from this app, then the form action creates the job.</p>
  <form method="POST" enctype="multipart/form-data" use:enhance={upload}>
    <label>File <input type="file" name="file" required /></label>
    <fieldset>
      <legend>Job</legend>
      <label><input type="radio" name="kind" value="transcode" checked /> One MP4 (POST /v1/transcode)</label>
      <label><input type="radio" name="kind" value="jobs" /> MP4, poster and GIF preview in one job (POST /v1/jobs)</label>
    </fieldset>
    <button type="submit">Upload and process</button>
  </form>
  <p role="status">{status}</p>
  {#if job?.error}
    <p>{job.error.code}: {job.error.message}</p>
  {/if}
  {#if job}
    <ul>
      {#each job.outputs as output (output.alias)}
        <li>
          <a href={resolve('/api/jobs/[id]/outputs/[alias]', { id: job.id, alias: output.alias })} data-sveltekit-reload
            >{output.filename}</a
          >
        </li>
      {/each}
    </ul>
  {/if}
  <div role="alert" class="problem">
    {#if problem}
      <p>{[problem.title, problem.detail].filter(Boolean).join(' ')}</p>
      {#each problem.errors ?? [] as item, i (i)}
        <p>{item.pointer} {item.detail}</p>
      {/each}
    {/if}
  </div>
</main>

<style>
  main {
    font:
      16px/1.5 system-ui,
      sans-serif;
    max-width: 40rem;
    margin: 2rem auto;
    padding: 0 1rem;
  }
  fieldset {
    margin: 1rem 0;
  }
  label {
    display: block;
  }
  .problem {
    color: #b3261e;
  }
</style>
