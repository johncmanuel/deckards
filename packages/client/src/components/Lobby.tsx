import { useState, useEffect } from "react";
import { colyseusClient, joinOrCreateLobbyServer } from "../utils/colyseusClient";
import { type Room } from "colyseus.js";
import { discordSDK } from "../utils/discord";
import { authenticate } from "../utils/auth";
import { GameState, type VoteGameMessage } from "@deckards/common";

type Joined = { id: string; name: string; clients: number };

export function Lobby() {
  const [joinedRoom, setJoinedRoom] = useState<Room<GameState> | null>(null);
  const [joinedInfo, setJoinedInfo] = useState<Joined | null>(null);

  useEffect(() => {
    if (joinedRoom) return;

    const joinLobby = async () => {
      try {
        const data = await authenticate();

        colyseusClient.auth.token = data.token;

        if (!discordSDK.channelId) {
          console.error("No channelId available from Discord SDK");
          return;
        }

        const room: Room<GameState> | null = await joinOrCreateLobbyServer({
          username: data.user.username,
          channelId: discordSDK.channelId,
        });

        if (!room) {
          console.error("Failed to join or create lobby room");
          return;
        }

        // players could be undefined at this time
        const initialCount = room.state.players?.size ?? 1;

        setJoinedRoom(room);
        setJoinedInfo({
          id: discordSDK.channelId,
          name: data.user.username,
          clients: initialCount || 1,
        });

        const updateRoom = () => {
          setJoinedInfo((prev) => (prev ? { ...prev, clients: room.state.players.size } : prev));
          setJoinedRoom((prev) => (prev ? room : prev));
        };
        room.onStateChange(updateRoom);

        room.onLeave(() => {
          setJoinedRoom(null);
          setJoinedInfo(null);
        });

        // switch to the appropiate game room when the lobby signals to do so
        room.onMessage("switch_game", (m: any) => console.log("switch_game", m));
      } catch (err) {
        console.error("Authentication error:", err);
      }
    };

    // join using the channelId as the lobby id
    // delay slightly to avoid race with other mounts
    setTimeout(() => {
      joinLobby();
    }, 50);
  }, [joinedRoom]);

  const handleStartGame = () => {
    if (joinedRoom) {
      // default to blackjack for now
      // in future, show game selection UI below
      const options: VoteGameMessage = { game: "BLACKJACK" };
      joinedRoom.send("vote_game", options);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-[#1f1f1f] rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-4">Lobby</h2>

      {joinedInfo && (
        <div className="mt-2">
          <div className="mb-2">
            Joined lobby as: <strong>{joinedInfo.name}</strong>
          </div>

          <div className="mb-2 flex items-center gap-3">
            <div className="text-sm text-gray-300">Lobby code:</div>
            <div className="font-mono px-3 py-1 bg-[#0b0b0b] rounded">{joinedInfo.id}</div>
            <button
              onClick={() => {
                if (navigator.clipboard && joinedInfo) {
                  navigator.clipboard.writeText(joinedInfo.id).catch(() => {});
                }
                console.log("Copied lobby ID to clipboard");
              }}
              className="px-2 py-1 bg-[#2563eb] rounded text-sm"
            >
              Copy
            </button>
          </div>

          <div className="mb-3">Players: {joinedInfo.clients}</div>
          {/* Players can leave the channel on Discord */}
          <div className="flex gap-2">
            <button onClick={handleStartGame} className="px-3 py-1 bg-[#ef4444] rounded">
              Start Game 
            </button>
          </div>
        </div>
      )}

      {!joinedInfo && <div className="mt-4 text-gray-400">Joining lobby...</div>}
    </div>
  );
}

export default Lobby;
