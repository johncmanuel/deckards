import { type GameState, type LobbyOptions, Activity } from "@deckards/common";
import { Client, Room, type SeatReservation } from "colyseus.js";

// Ensure colyseus is using the correct path when embedded in Discord
// Source:
// https://github.com/colyseus/discord-activity/issues/1#issuecomment-2709077431
const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get("frame_id") != null;
export const colyseusClient = new Client(isEmbedded ? "/.proxy/colyseus" : "/colyseus");

export async function joinOrCreateLobbyServer(
  options: LobbyOptions,
): Promise<Room<GameState> | null> {
  try {
    const room = await colyseusClient.joinOrCreate(Activity.LOBBY, options);
    return room;
  } catch (err) {
    return null;
  }
}

export async function consumeSeatReservation<T>(
  reservation: SeatReservation,
): Promise<Room<T> | null> {
  try {
    const room = await colyseusClient.consumeSeatReservation<T>(reservation);
    return room;
  } catch (err) {
    return null;
  }
}

export default colyseusClient;
