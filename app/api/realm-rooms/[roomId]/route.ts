import { getRealmRoom, realmBearerToken, RealmRoomError } from "@/lib/realm-online-room-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await context.params;
    const room = await getRealmRoom(roomId, realmBearerToken(request));
    return Response.json({ room });
  } catch (error) {
    const status = error instanceof RealmRoomError ? error.status : 500;
    const message = error instanceof RealmRoomError ? error.message : "The atlas could not be read.";
    return Response.json({ error: message }, { status });
  }
}
