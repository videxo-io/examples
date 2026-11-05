import type { RequestHandler } from '@sveltejs/kit';
import { problemResponse } from '#lib/server/respond.ts';
import { getJob } from '#lib/server/videxo.ts';

export const GET: RequestHandler = async ({ params }) => {
  try {
    return Response.json(await getJob(params.id!));
  } catch (error) {
    return problemResponse(error);
  }
};
