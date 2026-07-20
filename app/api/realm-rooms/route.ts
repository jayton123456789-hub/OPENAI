import { createRealmRoom, RealmRoomError } from "@/lib/realm-online-room-server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { name?: string };
    const result = await createRealmRoom(request, payload.name);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof RealmRoomError ? error.status : 500;
    const message = error instanceof RealmRoomError ? error.message : "The atlas could not open a room.";
    return Response.json({ error: message }, { status });
  }
}
