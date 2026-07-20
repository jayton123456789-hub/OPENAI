import { applyOnlineAction, bearerToken, OnlineRoomError } from "@/lib/online-room-server";

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await context.params;
    const payload: unknown = await request.json();
    const room = await applyOnlineAction(roomId, bearerToken(request), payload);
    return Response.json({ room });
  } catch (error) {
    const status = error instanceof OnlineRoomError ? error.status : 500;
    const message = error instanceof OnlineRoomError ? error.message : "The inquiry could not be completed.";
    return Response.json({ error: message }, { status });
  }
}
