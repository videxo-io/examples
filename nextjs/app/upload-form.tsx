'use client';

import { type FormEvent, useState } from 'react';

// The browser side: it never sees the API key. It asks the app's route handlers for an upload URL,
// PUTs the file there, asks for the job and reads it every 2 seconds until it ends.

type Output = { alias: string; filename: string };
type Job = { id: string; state: string; outputs: Output[]; error: { code: string; message: string } | null };
type Problem = { title?: string; detail?: string; errors?: { detail: string; pointer?: string }[] };

/** A plain filename as the API wants it: letters, digits, dots, underscores and hyphens. */
const plainName = (name: string) =>
  name
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(-100) || 'upload.bin';

/** A JSON request to this app; an error answer is thrown as its problem details. */
async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
  const json = await response.json().catch(() => null);
  if (!response.ok) throw (json ?? { title: 'The app answered with an error.', detail: `HTTP ${response.status}` }) as Problem;
  return json as T;
}

export function UploadForm() {
  const [status, setStatus] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  // snippet:start client
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    setJob(null);
    const form = new FormData(event.currentTarget);
    const file = form.get('file') as File;
    const contentType = file.type || 'application/octet-stream';
    try {
      setStatus('Creating the upload');
      const upload = await call<{ input_url: string; upload_url: string }>('/api/uploads', {
        filename: plainName(file.name),
        size_bytes: file.size,
        content_type: contentType,
      });
      setStatus('Uploading');
      // Straight to Videxo with the one-time URL: no API key, and the file never passes through this app.
      const put = await fetch(upload.upload_url, { method: 'PUT', headers: { 'content-type': contentType }, body: file });
      if (!put.ok) throw await put.json().catch(() => ({ title: 'The upload failed.', detail: `HTTP ${put.status}` }));
      let current = await call<Job>('/api/jobs', { kind: form.get('kind'), input_url: upload.input_url });
      while (current.state === 'queued' || current.state === 'running') {
        setStatus(`Job ${current.id}: ${current.state}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        current = await call<Job>(`/api/jobs/${current.id}`);
      }
      setStatus(`Job ${current.id}: ${current.state}`);
      setJob(current);
    } catch (error) {
      setStatus('');
      setProblem(error as Problem);
    }
  }
  // snippet:end client

  return (
    <>
      <form onSubmit={submit}>
        <label style={{ display: 'block' }}>
          File <input type="file" name="file" required />
        </label>
        <fieldset style={{ margin: '1rem 0' }}>
          <legend>Job</legend>
          <label style={{ display: 'block' }}>
            <input type="radio" name="kind" value="transcode" defaultChecked /> One MP4 (POST /v1/transcode)
          </label>
          <label style={{ display: 'block' }}>
            <input type="radio" name="kind" value="jobs" /> MP4, poster and GIF preview in one job (POST /v1/jobs)
          </label>
        </fieldset>
        <button type="submit">Upload and process</button>
      </form>
      <p role="status">{status}</p>
      {job?.error && (
        <p>
          {job.error.code}: {job.error.message}
        </p>
      )}
      <ul>
        {job?.outputs.map((output) => (
          <li key={output.alias}>
            <a href={`/api/jobs/${job.id}/outputs/${output.alias}`}>{output.filename}</a>
          </li>
        ))}
      </ul>
      <div role="alert" style={{ color: '#b3261e' }}>
        {problem && (
          <>
            <p>{[problem.title, problem.detail].filter(Boolean).join(' ')}</p>
            {problem.errors?.map((item, i) => (
              <p key={i}>
                {item.pointer} {item.detail}
              </p>
            ))}
          </>
        )}
      </div>
    </>
  );
}
