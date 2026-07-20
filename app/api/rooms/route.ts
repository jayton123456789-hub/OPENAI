import { createOnlineRoom, OnlineRoomError } from "@/lib/online-room-server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { name?: string };
    const result = await createOnlineRoom(request, payload.name);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof OnlineRoomError ? error.status : 500;
    const message = error instanceof OnlineRoomError ? error.message : "The Veil could not open a room.";
    return Response.json({ error: message }, { status });
  }
}
