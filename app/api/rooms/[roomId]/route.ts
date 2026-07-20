import { bearerToken, getOnlineRoom, OnlineRoomError } from "@/lib/online-room-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await context.params;
    const room = await getOnlineRoom(roomId, bearerToken(request));
    return Response.json({ room });
  } catch (error) {
    const status = error instanceof OnlineRoomError ? error.status : 500;
    const message = error instanceof OnlineRoomError ? error.message : "The circle could not be read.";
    return Response.json({ error: message }, { status });
  }
}
