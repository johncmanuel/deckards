import { useState, useEffect, useRef } from "react";
import {
  colyseusClient,
  consumeSeatReservation,
  joinOrCreateLobbyServer,
} from "../utils/colyseusClient";
import { type Room } from "colyseus.js";
import { discordSDK } from "../utils/discord";
import { authenticate } from "../utils/auth";
import {
  GameState,
  type VoteGameMessage,
  BlackjackState,
  SelectedGame,
  type LobbySeatReservationOptions,
  type LobbyOptions,
  type ServerMultiplayerError,
} from "@deckards/common";
import Blackjack from "./Blackjack";
import { isDevelopment } from "../utils/envVars";

type Joined = { id: string; name: string; clients: number; isLeader: boolean };

export function Game() {
  const [joinedRoom, setJoinedRoom] = useState<Room<GameState> | null>(null);
  const [joinedInfo, setJoinedInfo] = useState<Joined | null>(null);

  const [blackjackRoom, setBlackjackRoom] = useState<Room<BlackjackState> | null>(null);

  const [selectedGame, setSelectedGame] = useState<SelectedGame>(SelectedGame.BLACKJACK);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  // prevent duplicate join attempts to the server during development
  const isJoiningRef = useRef(false);

  useEffect(() => {
    if (joinedRoom || (isDevelopment && isJoiningRef.current)) return;

    const joinLobby = async () => {
      try {
        if (isDevelopment) {
          isJoiningRef.current = true;
        }

        setProgressMessage("Authenticating with Discord...");
        const data = await authenticate();

        colyseusClient.auth.token = data.token;

        if (!discordSDK.channelId) {
          const errorMsg = "No channelId available from Discord SDK";
          if (isDevelopment) {
            isJoiningRef.current = false;
          }
          throw new Error(errorMsg);
        }

        const lobbyOpts: LobbyOptions = {
          username: data.user.username,
          channelId: discordSDK.channelId,
        };

        setProgressMessage(
          "Connecting to lobby server... options:" + `${JSON.stringify(lobbyOpts)}`,
        );

        const room = await joinOrCreateLobbyServer(lobbyOpts)

        if (!room) {
          const errorMsg = "Failed to join or create lobby room - received null response";
          console.error(errorMsg);
          if (isDevelopment) {
            isJoiningRef.current = false;
          }
          throw new Error(errorMsg);
        }

        // players could be undefined at this time
        const initialCount = room.state.players?.size ?? 1;
        const isLeader = room.sessionId === room.state.lobbyLeader;

        setJoinedRoom(room);
        setJoinedInfo({
          id: discordSDK.channelId,
          name: data.user.username,
          clients: initialCount || 1,
          isLeader: isLeader,
        });
        setProgressMessage(null);

        // TODO: manage state updates more cleanly
        // const $ = getStateCallbacks(room);

        room.onStateChange(() => {
          const updatedIsLeader = room.sessionId === room.state.lobbyLeader;
          setJoinedInfo((prev) =>
            prev
              ? {
                  ...prev,
                  clients: room.state.players?.size ?? 1,
                  isLeader: updatedIsLeader,
                }
              : prev,
          );
          setJoinedRoom((prev) => (prev ? room : prev));
        });

        room.onLeave(() => {
          setJoinedRoom(null);
          setJoinedInfo(null);
        });

        room.onMessage("seat_reservation", async (message: LobbySeatReservationOptions) => {
          console.log("Received seat reservation for", message.game);

          if (message.game === SelectedGame.BLACKJACK) {
            try {
              const gameRoom = await consumeSeatReservation(message.reservation);
              if (gameRoom) {
                setBlackjackRoom(gameRoom);

                gameRoom.onLeave(() => {
                  console.log("Left blackjack room, returning to lobby");
                  setBlackjackRoom(null);
                });
              }
            } catch (err) {
              const errorMsg = `Failed to consume seat reservation: ${err instanceof Error ? err.message : String(err)}`;
              console.error(errorMsg);
              setErrorMessage(errorMsg);
            }
          }
        });

        room.onMessage("error", (m: ServerMultiplayerError) => {
          const errorMsg = `Server error: ${m.message}`;
          console.error(errorMsg);
          setErrorMessage(errorMsg);
        });
      } catch (err) {
        const errorMsg = `Caught error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(errorMsg);
        setErrorMessage(errorMsg);
        setProgressMessage(null);
        if (isDevelopment) {
          isJoiningRef.current = false;
        }
      }
    };

    // join using the channelId as the lobby id
    // delay slightly to avoid race with other mounts
    const timeoutId = setTimeout(() => {
      joinLobby();
    }, 50);

    // prevent duplicate joins
    return () => {
      clearTimeout(timeoutId);
      // if component unmounts before joining completes, reset the flag
      if (isDevelopment && !joinedRoom) {
        isJoiningRef.current = false;
      }
    };
  }, [joinedRoom]);

  const handleStartGame = () => {
    if (joinedRoom) {
      // TODO: may need to send the token to the server? ATM, starting a game room requires auth
      const options: VoteGameMessage = { game: selectedGame };
      joinedRoom.send("start_game", options);
    }
  };

  return (
    <>
      {errorMessage && (
        <div className="max-w-2xl mx-auto mb-4 p-4 bg-red-900/50 border border-red-500 rounded-lg shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-200 mb-1">Error</h3>
              <p className="text-red-100">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm font-medium transition-colors"
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {progressMessage && (
        <div className="max-w-2xl mx-auto mb-4 p-4 bg-blue-900/50 border border-blue-500 rounded-lg shadow-md">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-300 border-t-transparent rounded-full"></div>
            <div className="flex-1">
              <p className="text-blue-100 font-medium">{progressMessage}</p>
            </div>
          </div>
        </div>
      )}

      {!blackjackRoom && (
        <div className="max-w-2xl mx-auto p-6 bg-[#1f1f1f] rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">Lobby</h2>
          {joinedInfo && (
            <div className="mt-2">
              <div className="mb-2">
                Joined lobby as: <strong>{joinedInfo.name}</strong>
                {joinedInfo.isLeader && (
                  <span className="ml-2 px-2 py-1 bg-yellow-600 text-xs rounded">Leader</span>
                )}
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

              <div className="mb-3">
                <div className="text-sm text-gray-300 mb-2">Players: {joinedInfo.clients}</div>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {joinedRoom &&
                    joinedRoom.state.players &&
                    Array.from(joinedRoom.state.players.values()).map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center gap-3 bg-[#2a2a2a] px-3 py-2 rounded"
                      >
                        {player.avatarUrl ? (
                          <img
                            src={player.avatarUrl}
                            alt={player.username}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold">
                            {player.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-white font-medium">{player.username}</p>
                          {player.id === joinedRoom.state.lobbyLeader && (
                            <span className="text-xs text-yellow-400">Leader</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {joinedInfo.isLeader && (
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Select Game:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSelectedGame(SelectedGame.BLACKJACK)}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${
                          selectedGame === SelectedGame.BLACKJACK
                            ? "border-blue-500 bg-blue-500/20 text-white"
                            : "border-gray-600 bg-[#2a2a2a] text-gray-300 hover:border-gray-500"
                        }`}
                      >
                        <div className="font-semibold">Blackjack</div>
                        <div className="text-xs mt-1 opacity-75">Classic 21</div>
                      </button>
                      <button
                        onClick={() => setSelectedGame(SelectedGame.BS)}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${
                          selectedGame === SelectedGame.BS
                            ? "border-blue-500 bg-blue-500/20 text-white"
                            : "border-gray-600 bg-[#2a2a2a] text-gray-300 hover:border-gray-500"
                        }`}
                      >
                        <div className="font-semibold">BS</div>
                        <div className="text-xs mt-1 opacity-75">Bluffing game</div>
                      </button>
                    </div>
                  </div>
                  {/* TODO: use @deckards/common to set these requirements on both client and server without
                  repeating the logic
                   */}
                  <button
                    onClick={handleStartGame}
                    className={`px-3 py-2 rounded ${
                      (selectedGame === SelectedGame.BLACKJACK &&
                        joinedInfo.clients >= 1 &&
                        joinedInfo.clients <= 7) ||
                      (selectedGame === SelectedGame.BS && joinedInfo.clients === 2)
                        ? "bg-[#ef4444] hover:bg-[#dc2626] cursor-pointer"
                        : "bg-gray-600 cursor-not-allowed opacity-50"
                    }`}
                    disabled={
                      (selectedGame === SelectedGame.BLACKJACK &&
                        (joinedInfo.clients < 1 || joinedInfo.clients > 7)) ||
                      (selectedGame === SelectedGame.BS && joinedInfo.clients !== 2)
                    }
                  >
                    Start Game
                  </button>
                  {selectedGame === SelectedGame.BS && joinedInfo.clients !== 2 && (
                    <p className="text-xs text-gray-400">BS requires exactly 2 players</p>
                  )}
                  {selectedGame === SelectedGame.BLACKJACK &&
                    (joinedInfo.clients < 1 || joinedInfo.clients > 7) && (
                      <p className="text-xs text-gray-400">
                        Blackjack requires between 1 and 7 players
                      </p>
                    )}
                </div>
              )}

              {!joinedInfo.isLeader && (
                <div className="text-sm text-gray-400">
                  Waiting for lobby leader to start the game...
                </div>
              )}
            </div>
          )}
          {!joinedInfo && <div className="mt-4 text-gray-400">Joining lobby...</div>}
        </div>
      )}

      {blackjackRoom && <Blackjack room={blackjackRoom} onLeave={() => setBlackjackRoom(null)} />}
    </>
  );
}

export default Game;
