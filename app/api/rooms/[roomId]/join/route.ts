import { joinOnlineRoom, OnlineRoomError } from "@/lib/online-room-server";

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await context.params;
    const payload = (await request.json()) as { token?: string; name?: string };
    const room = await joinOnlineRoom(roomId, payload.token ?? "", payload.name);
    return Response.json({ room });
  } catch (error) {
    const status = error instanceof OnlineRoomError ? error.status : 500;
    const message = error instanceof OnlineRoomError ? error.message : "The second seat could not be claimed.";
    return Response.json({ error: message }, { status });
  }
}
