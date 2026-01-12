import type { BlackjackState, GameState, LobbyOptions } from "@deckards/common";
import { Client, Room, type SeatReservation } from "colyseus.js";

function getEndpoint() {
  if (typeof window === "undefined") return "ws://localhost:2567";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:2567`;
}

export const colyseusClient = new Client(getEndpoint());

// TODO: create shared typings for options in @deckards/common

export async function joinOrCreateLobbyServer(
  options: LobbyOptions,
): Promise<Room<GameState> | null> {
  try {
    const room = await colyseusClient.joinOrCreate("lobby", options);
    return room;
  } catch (err) {
    console.error("joinOrCreateLobbyServer error", err);
    return null;
  }
}

export async function joinOrCreateBlackjackRoom(
  options: any = {},
): Promise<Room<BlackjackState> | null> {
  try {
    const room = await colyseusClient.joinOrCreate("blackjack", options);
    return room;
  } catch (err) {
    console.error("joinOrCreateBlackjackRoom error", err);
    return null;
  }
}

export async function consumeSeatReservation(
  reservation: SeatReservation,
): Promise<Room<BlackjackState> | null> {
  try {
    const room = await colyseusClient.consumeSeatReservation<BlackjackState>(reservation);
    return room;
  } catch (err) {
    console.error("consumeSeatReservation error", err);
    return null;
  }
}

export default colyseusClient;
