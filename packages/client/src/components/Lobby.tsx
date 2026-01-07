import { useState, useEffect } from "react";
import {
  createLobbyServer,
  joinLobbyServerById,
  colyseusClient,
  joinOrCreateLobbyServer,
} from "../utils/colyseusClient";
import { type Room } from "colyseus.js";
import { discordSDK, isEmbedded } from "../utils/discord";
import { authenticate } from "../utils/auth";

type Joined = { id: string; name: string; clients: number };

export function Lobby() {
  const [playerName, setPlayerName] = useState("");
  const [lobbyName, setLobbyName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joinedRoom, setJoinedRoom] = useState<Room | null>(null);
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

        const room = await joinOrCreateLobbyServer({
          username: playerName,
          channelId: discordSDK.channelId,
        });

        if (!room) {
          console.error("Failed to join or create lobby room");
          return;
        }

        setJoinedRoom(room);
        setJoinedInfo({
          id: discordSDK.channelId,
          name: lobbyName || room.roomId,
          clients: room.clients || 1,
        });
        room.onLeave(() => {
          setJoinedRoom(null);
          setJoinedInfo(null);
        });
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
  }, []);

  //   async function createLobby() {
  //     if (!lobbyName || !playerName) return;
  //     const room = await createLobbyServer(lobbyName, { username: playerName });
  //     console.log("Created lobby room:", room);
  //     if (room) {
  //       setJoinedRoom(room);
  //       setJoinedInfo({ id: room.roomId, name: lobbyName, clients: room.clients || 1 });
  //       room.onLeave(() => {
  //         setJoinedRoom(null);
  //         setJoinedInfo(null);
  //       });
  //       room.onMessage("switch_game", (m: any) => console.log("switch_game", m));
  //     }
  //     setLobbyName("");
  //   }

  //   // Accept optional username to avoid relying on setState timing
  //   async function joinLobby(id: string, username?: string) {
  //     const usernameToUse = username || playerName;
  //     if (!usernameToUse) return;
  //     const room = await joinLobbyServerById(id, { username: usernameToUse });
  //     console.log("Joined lobby room:", room);
  //     if (room) {
  //       setJoinedRoom(room);
  //       setJoinedInfo({ id: room.roomId, name: id, clients: room.clients || 1 });
  //       room.onLeave(() => {
  //         setJoinedRoom(null);
  //         setJoinedInfo(null);
  //       });
  //       room.onMessage("switch_game", (m: any) => console.log("switch_game", m));
  //     }
  //   }

  async function leaveLobby() {
    if (!joinedRoom) return;
    try {
      await joinedRoom.leave();
    } catch (err) {
      console.error(err);
    }
    setJoinedRoom(null);
    setJoinedInfo(null);
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-[#1f1f1f] rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-4">Lobby</h2>

      {/* <div className="mb-4 grid grid-cols-1 gap-2">
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Your name"
          className="px-3 py-2 rounded bg-[#0f0f0f] border border-[#2a2a2a]"
        />

        {!joinedInfo && (
          <>
            <div className="flex gap-2">
              <input
                value={lobbyName}
                onChange={(e) => setLobbyName(e.target.value)}
                placeholder="Create lobby (name)"
                className="flex-1 px-3 py-2 rounded bg-[#0f0f0f] border border-[#2a2a2a]"
              />
              <button
                onClick={() => createLobby()}
                className="px-4 py-2 bg-[#4f46e5] rounded hover:opacity-90"
              >
                Create
              </button>
            </div>

            <div className="mt-3">
              <div className="flex gap-2">
                <input
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  placeholder="Enter lobby ID to join"
                  className="flex-1 px-3 py-2 rounded bg-[#0f0f0f] border border-[#2a2a2a]"
                />
                <button
                  onClick={() => joinLobby(joinId)}
                  className="px-3 py-2 bg-[#10b981] rounded"
                >
                  Join by ID
                </button>
              </div>
            </div>
          </>
        )} */}

      {joinedInfo && (
        <div className="mt-2">
          <div className="mb-2">
            Joined lobby: <strong>{joinedInfo.name}</strong>
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
          <div className="flex gap-2">
            <button onClick={leaveLobby} className="px-3 py-1 bg-[#ef4444] rounded">
              Leave
            </button>
          </div>
        </div>
      )}

      {!joinedInfo && <div className="mt-4 text-gray-400">Joining lobby...</div>}
    </div>
    // </div>
  );
}

export default Lobby;
