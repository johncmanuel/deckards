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

        const room = await joinOrCreateLobbyServer(lobbyOpts);

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
      const options: VoteGameMessage = { game: selectedGame };
      joinedRoom.send("start_game", options);
    }
  };

  return (
    <>
      {!blackjackRoom && (
        <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl">
            {errorMessage && (
              <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-lg shadow-sm">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-red-800 mb-1">Error</h3>
                    <p className="text-red-700 text-sm sm:text-base break-words">{errorMessage}</p>
                  </div>
                  <button
                    onClick={() => setErrorMessage(null)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors shrink-0"
                    aria-label="Dismiss error"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {progressMessage && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-blue-800 font-medium text-sm sm:text-base break-words">
                      {progressMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-6 sm:p-8">
              <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 text-center">
                Lobby
              </h2>
              {joinedInfo && (
                <div>
                  <div className="mb-6 text-center text-gray-700">
                    <span className="text-base sm:text-lg">Joined as: </span>
                    <strong className="text-gray-900 text-lg sm:text-xl">{joinedInfo.name}</strong>
                    {joinedInfo.isLeader && (
                      <span className="ml-3 px-3 py-1 bg-amber-100 text-amber-800 text-sm rounded-full font-medium inline-block">
                        👑 Leader
                      </span>
                    )}
                  </div>

                  <div className="mb-6">
                    <div className="text-base text-gray-600 mb-3 font-medium text-center">
                      Players ({joinedInfo.clients})
                    </div>
                    <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
                      {joinedRoom &&
                        joinedRoom.state.players &&
                        Array.from(joinedRoom.state.players.values()).map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center gap-4 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 px-4 py-3 rounded-lg hover:shadow-md transition-shadow"
                          >
                            {player.avatarUrl ? (
                              <img
                                src={player.avatarUrl}
                                alt={player.username}
                                className="w-12 h-12 rounded-full shrink-0 border-2 border-gray-200"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm">
                                {player.username.charAt(0).toUpperCase() || "P"}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-800 font-semibold text-base sm:text-lg truncate">
                                {player.username}
                              </p>
                              {player.id === joinedRoom.state.lobbyLeader && (
                                <span className="text-xs text-amber-600 font-medium">
                                  👑 Leader
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {joinedInfo.isLeader && (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="block text-base text-gray-600 mb-3 font-medium text-center">
                          Select a Game:
                        </label>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <button
                            onClick={() => setSelectedGame(SelectedGame.BLACKJACK)}
                            className={`px-4 py-4 rounded-xl border-2 transition-all ${
                              selectedGame === SelectedGame.BLACKJACK
                                ? "border-blue-500 bg-blue-50 text-blue-800 shadow-md"
                                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:shadow-sm"
                            }`}
                          >
                            <div className="font-bold text-base sm:text-lg">🃏 Blackjack</div>
                            <div className="text-xs mt-1 opacity-70">Classic 21</div>
                          </button>
                          <button
                            onClick={() => setSelectedGame(SelectedGame.BS)}
                            className={`px-4 py-4 rounded-xl border-2 transition-all ${
                              selectedGame === SelectedGame.BS
                                ? "border-blue-500 bg-blue-50 text-blue-800 shadow-md"
                                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:shadow-sm"
                            }`}
                            // will be delivered in the future!
                            disabled={true}
                          >
                            <div className="font-bold text-base sm:text-lg">🎯 BS</div>
                            <div className="text-xs mt-1 opacity-70">Bluffing game</div>
                          </button>
                        </div>
                      </div>
                      {/* TODO: use @deckards/common to set these requirements on both client and server without
                  repeating the logic
                   */}
                      <button
                        onClick={handleStartGame}
                        className={`w-full px-6 py-4 rounded-xl font-bold transition-all text-base sm:text-lg ${
                          (selectedGame === SelectedGame.BLACKJACK &&
                            joinedInfo.clients >= 1 &&
                            joinedInfo.clients <= 7) ||
                          (selectedGame === SelectedGame.BS && joinedInfo.clients === 2)
                            ? "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white cursor-pointer shadow-lg hover:shadow-xl"
                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                        disabled={
                          (selectedGame === SelectedGame.BLACKJACK &&
                            (joinedInfo.clients < 1 || joinedInfo.clients > 7)) ||
                          (selectedGame === SelectedGame.BS && joinedInfo.clients !== 2)
                        }
                      >
                        🎮 Start Game
                      </button>
                      {selectedGame === SelectedGame.BS && joinedInfo.clients !== 2 && (
                        <p className="text-sm text-gray-500 text-center">
                          BS requires exactly 2 players
                        </p>
                      )}
                      {selectedGame === SelectedGame.BLACKJACK &&
                        (joinedInfo.clients < 1 || joinedInfo.clients > 7) && (
                          <p className="text-sm text-gray-500 text-center">
                            Blackjack requires between 1 and 7 players
                          </p>
                        )}
                    </div>
                  )}

                  {!joinedInfo.isLeader && (
                    <div className="text-center text-gray-500 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <p className="text-sm sm:text-base">
                        ⏳ Waiting for lobby leader to start the game...
                      </p>
                    </div>
                  )}
                </div>
              )}
              {!joinedInfo && (
                <div className="text-center text-gray-500 py-8">
                  <div className="animate-pulse text-base sm:text-lg">Joining lobby...</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {blackjackRoom && <Blackjack room={blackjackRoom} onLeave={() => setBlackjackRoom(null)} />}
    </>
  );
}

export default Game;
