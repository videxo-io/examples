import { type RequestHandler, redirect } from '@sveltejs/kit';
import { problemResponse } from '#lib/server/respond.ts';
import { outputUrl } from '#lib/server/videxo.ts';

// snippet:start download-route
export const GET: RequestHandler = async ({ params }) => {
  let url: string;
  try {
    // A fresh link each time: signed links expire within an hour.
    url = await outputUrl(params.id!, params.alias!);
  } catch (error) {
    return problemResponse(error);
  }
  redirect(302, url, { external: true });
};
// snippet:end download-route
