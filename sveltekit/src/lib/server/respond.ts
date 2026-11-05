import { VidexoProblem } from './videxo.ts';

// Error answers of this app's endpoints, as problem details (RFC 9457) like Videxo's own.

/** Videxo's problem details as they came, so the page can show `detail` and the field errors; anything else is a plain 500. */
export function problemResponse(error: unknown): Response {
  const headers = { 'content-type': 'application/problem+json' };
  if (error instanceof VidexoProblem) return new Response(JSON.stringify(error.problem), { status: error.problem.status, headers });
  console.error(error);
  return new Response(JSON.stringify({ title: 'Something went wrong.', status: 500 }), { status: 500, headers });
}
