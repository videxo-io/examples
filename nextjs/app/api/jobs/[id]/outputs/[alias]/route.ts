import { problemResponse } from '@/lib/respond';
import { outputUrl } from '@/lib/videxo';

// snippet:start download-route
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; alias: string }> }) {
  try {
    const { id, alias } = await params;
    // A fresh link each time: signed links expire within an hour.
    return Response.redirect(await outputUrl(id, alias), 302);
  } catch (error) {
    return problemResponse(error);
  }
}
// snippet:end download-route
