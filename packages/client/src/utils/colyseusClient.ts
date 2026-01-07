import { Client, Room } from "colyseus.js";

function getEndpoint() {
  if (typeof window === "undefined") return "ws://localhost:2567";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:2567`;
}

export const colyseusClient = new Client(getEndpoint());

export async function createLobbyServer(name: string, options: any = {}): Promise<Room | null> {
  try {
    const room = await colyseusClient.create("lobby", { ...options, name });
    return room;
  } catch (err) {
    console.error("createLobbyServer error", err);
    return null;
  }
}

export async function joinLobbyServerById(id: string, options: any = {}): Promise<Room | null> {
  try {
    const room = await colyseusClient.joinById(id, options);
    return room;
  } catch (err) {
    console.error("joinLobbyServerById error", err);
    return null;
  }
}

export async function joinOrCreateLobbyServer(options: any = {}): Promise<Room | null> {
  try {
    const room = await colyseusClient.joinOrCreate("lobby", options);
    return room;
  } catch (err) {
    console.error("joinOrCreateLobbyServer error", err);
    return null;
  }
}

export default colyseusClient;
