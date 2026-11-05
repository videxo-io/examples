import { problemResponse } from '@/lib/respond';
import { getJob } from '@/lib/videxo';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return Response.json(await getJob((await params).id));
  } catch (error) {
    return problemResponse(error);
  }
}
