import { applyRealmRoomAction, realmBearerToken, RealmRoomError } from "@/lib/realm-online-room-server";

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await context.params;
    const payload: unknown = await request.json();
    const room = await applyRealmRoomAction(roomId, realmBearerToken(request), payload);
    return Response.json({ room });
  } catch (error) {
    const status = error instanceof RealmRoomError ? error.status : 500;
    const message = error instanceof RealmRoomError ? error.message : "The move could not be completed.";
    return Response.json({ error: message }, { status });
  }
}
