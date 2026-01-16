import { useState, useEffect } from "react";
import { extend, Application } from "@pixi/react";
import { Container, Sprite, Texture, TextureSource, Assets, DEPRECATED_SCALE_MODES } from "pixi.js";
import { Room } from "colyseus.js";
import {
  BlackjackState,
  type BlackjackPlayer,
  calculateHandScore,
  type GameOverResults,
} from "@deckards/common";
import { CARD_BACK, getAllCardAssets, type Card, serverCardToClientCard } from "./ClientCard";

extend({ Container, Sprite });

// some of the variables and types will be placed in @deckards/common later;
// this is currently for prototyping purposes

interface OtherPlayer {
  username: string;
  hand: Card[];
  score: number;
  displayScore: string;
  isCurrentTurn: boolean;
}

interface WindowDimensions {
  width: number;
  height: number;
}

function calculateVisibleScore(hand: Card[]): number {
  const visibleCards = hand.filter((card) => !card.isHidden);
  return calculateHandScore(visibleCards);
}

function formatObfuscatedScore(hand: Card[], fullScore: number): string {
  const hasHiddenCards = hand.some((c) => c.isHidden);

  if (!hasHiddenCards) {
    return fullScore.toString();
  }

  const visibleScore = calculateVisibleScore(hand);
  return visibleScore > 0 ? `? + ${visibleScore}` : "?";
}

export function Blackjack({
  room,
  onLeave,
}: {
  room?: Room<BlackjackState>;
  onLeave?: () => void;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [otherPlayers, setOtherPlayers] = useState<OtherPlayer[]>([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);
  const [dealerDisplayScore, setDealerDisplayScore] = useState<string>("?");
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [currentTurnUsername, setCurrentTurnUsername] = useState<string | null>(null);
  const [winners, setWinners] = useState<string[]>([]);
  const [windowSize, setWindowSize] = useState<WindowDimensions>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  // after some eyeballing on the dev tools using different screen sizes,
  // i've decided to go with this value
  const MOBILE_WIDTH_THRESHOLD_PX = 908;
  const isMobile = windowSize.width < MOBILE_WIDTH_THRESHOLD_PX;

  // track window size for a more responsive layout
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    async function loadAssets() {
      try {
        // Set pixel art scaling mode globally before loading
        TextureSource.defaultOptions.scaleMode = DEPRECATED_SCALE_MODES.NEAREST;

        const allCardAssets = getAllCardAssets();
        allCardAssets.push(CARD_BACK);

        await Assets.load(allCardAssets);
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load assets", err);
      }
    }

    loadAssets();
  }, []);

  useEffect(() => {
    if (!room) return;

    // TODO: review and refactor overall game state logic
    // const $ = getStateCallbacks(room);

    const updateGameState = () => {
      // ensure state is initialized
      if (!room.state || !room.state.players) {
        console.log("Room state not yet initialized");
        return;
      }

      const currentPlayer = room.state.players.get(room.sessionId) as BlackjackPlayer | undefined;

      setIsLeader(room.sessionId === room.state.gameLeader);
      
      const isCurrentPlayersTurn = room.state.currentTurn === room.sessionId;
      setIsMyTurn(isCurrentPlayersTurn);
      setRoundTimeLeft(room.state.roundTimeLeft);
      
      if (room.state.currentTurn) {
        const turnPlayer = room.state.players.get(room.state.currentTurn);
        setCurrentTurnUsername(turnPlayer?.username || null);
      } else {
        setCurrentTurnUsername(null);
      }

      if (currentPlayer) {
        const playerCards = Array.from(currentPlayer.hand ?? []).map((serverCard) => {
          const card = serverCardToClientCard(serverCard);
          return { ...card, isHidden: false }; // always show own cards
        });

        setPlayerHand(playerCards);
        setPlayerScore(currentPlayer.roundScore);
        setCanPlay(!currentPlayer.isBusted && !currentPlayer.isStanding && isCurrentPlayersTurn);
      }

      // update other players
      const others: OtherPlayer[] = [];
      if (room.state.players) {
        room.state.players.forEach((p, sessionId) => {
          if (sessionId !== room.sessionId) {
            const player = p as BlackjackPlayer;
            const hand = Array.from(player.hand ?? [])
              .filter((serverCard) => serverCard.suit !== "" && serverCard.rank !== "")
              .map((serverCard) => {
                const card = serverCardToClientCard(serverCard);
                return { ...card, isHidden: false };
              });
            others.push({
              username: player.username,
              hand: hand,
              score: player.roundScore,
              displayScore: formatObfuscatedScore(hand, player.roundScore),
              isCurrentTurn: room.state.currentTurn === sessionId,
            });
          }
        });
      }
      setOtherPlayers(others);

      const dealerCards = Array.from(room.state.dealerHand ?? []).map(serverCardToClientCard);
      setDealerHand(dealerCards);
      setDealerDisplayScore(formatObfuscatedScore(dealerCards, room.state.dealerScore));

      // game starts if there are cards
      setIsGameStarted(dealerCards.length > 0 || (currentPlayer?.hand?.length ?? 0) > 0);
    };

    updateGameState();

    room.onStateChange(updateGameState);

    room.onMessage("game_over", (data: GameOverResults) => {
      setIsGameOver(true);
      setCanPlay(false);
      setWinners(data.winners || []);
    });

    room.onMessage("round_started", () => {
      setIsGameOver(false);
      setWinners([]);
    });

    return () => {
      room.removeAllListeners();
    };
  }, [room]);

  const handleStartGame = () => {
    if (room) {
      room.send("start_game");
    }
  };

  const handleHit = () => {
    if (room && canPlay) {
      room.send("hit");
    }
  };

  const handleStand = () => {
    if (room && canPlay) {
      room.send("stand");
    }
  };

  const handleLeave = async () => {
    if (room) {
      try {
        await room.leave();
        console.log("Successfully left blackjack room");
        // notify parent component to switch back to lobby
        if (onLeave) {
          onLeave();
        }
      } catch (err) {
        console.error("Error leaving blackjack room:", err);
      }
    }
  };

  const getTexture = (url: string) => {
    try {
      return Texture.from(url);
    } catch {
      return Texture.EMPTY;
    }
  };

  // UI isn't perfect yet, but this will do for now, lol

  // constants for computing UI layout

  const NUM_PLAYERS_PER_SIDE = 3; // other players displayed on client's left and right sides

  const MAX_CARD_HEIGHT_PX = 120;
  const CARD_ASPECT_RATIO = 2 / 3;
  const CARD_HEIGHT_SCALE = 0.18; // percentage of viewport height

  const DEALER_VERTICAL_POS = 0.15; // percentage from top screen (NOTE: dealer is always positioned at the top of screen)
  const PLAYER_MAX_VERTICAL_POS = 0.55; // max percentage from the bottom of the screen
  const SIDE_PLAYERS_START_POS = 0.2; // percentage from top

  const PLAYER_BOTTOM_BUFFER_PX = 220; // spacing between player text and bottom button controls
  const SIDE_PLAYER_MAX_SPACING_PX = 270; // max spacing between each side player
  const SIDE_PLAYER_BOTTOM_BUFFER_PX = 100; // bottom margin for side players

  // compute UI layout values

  const cardHeight = Math.min(MAX_CARD_HEIGHT_PX, windowSize.height * CARD_HEIGHT_SCALE);
  const cardWidth = cardHeight * CARD_ASPECT_RATIO;

  const dealerY = windowSize.height * DEALER_VERTICAL_POS;
  const playerY = Math.max(
    windowSize.height - cardHeight - PLAYER_BOTTOM_BUFFER_PX,
    windowSize.height * PLAYER_MAX_VERTICAL_POS,
  );

  const sidePlayerStartY = windowSize.height * SIDE_PLAYERS_START_POS;
  const sidePlayerSpacing = Math.min(
    SIDE_PLAYER_MAX_SPACING_PX,
    (windowSize.height - sidePlayerStartY - SIDE_PLAYER_BOTTOM_BUFFER_PX) / NUM_PLAYERS_PER_SIDE, // there are 3 players per side
  );

  const leftPlayers = otherPlayers.slice(0, NUM_PLAYERS_PER_SIDE);
  const rightPlayers = otherPlayers.slice(NUM_PLAYERS_PER_SIDE);

  const RenderHand = ({
    hand,
    startX,
    startY,
    setStackDirectionToRight = true,
  }: {
    hand: Card[];
    startX: number;
    startY: number;
    setStackDirectionToRight?: boolean;
  }) => {
    return (
      <pixiContainer x={startX} y={startY}>
        {hand.map((c, i) => {
          const xOffset = setStackDirectionToRight ? i * 30 : (hand.length - 1 - i) * 30;
          return (
            <pixiSprite
              key={`${c.suit}-${c.rank}-${i}`}
              texture={getTexture(c.isHidden ? CARD_BACK : c.asset)}
              x={xOffset}
              y={0}
              width={cardWidth}
              height={cardHeight}
              // TODO: make cards after first card more readable (can only see rank visually by its bottom right corner)
              // anchor={setStackDirectionToRight ? undefined : 0.5}
              // scale={setStackDirectionToRight ? undefined : {x: 1, y: -1}}
            />
          );
        })}
      </pixiContainer>
    );
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-emerald-50 text-emerald-800 font-medium">
        Loading Assets...
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-emerald-800 overflow-hidden">
      <div className="absolute inset-0 z-0">
        {/* show the hands */}
        <Application resizeTo={window} backgroundAlpha={0} resolution={1}>
          {dealerHand.length > 0 && (
            <RenderHand
              hand={dealerHand}
              startX={windowSize.width / 2 - cardWidth}
              startY={dealerY}
            />
          )}

          {/* split other players' hands on left and right hand side of screen (desktop only) */}

          {!isMobile &&
            leftPlayers.map((other, idx) => (
              <RenderHand
                key={other.username}
                hand={other.hand}
                startX={50}
                startY={sidePlayerStartY + idx * sidePlayerSpacing}
              />
            ))}

          {!isMobile &&
            rightPlayers.map((other, idx) => (
              <RenderHand
                key={other.username}
                hand={other.hand}
                startX={windowSize.width - cardWidth - 100}
                startY={sidePlayerStartY + idx * sidePlayerSpacing}
                setStackDirectionToRight={false}
              />
            ))}

          {playerHand.length > 0 && (
            <RenderHand
              hand={playerHand}
              startX={windowSize.width / 2 - cardWidth}
              startY={playerY}
            />
          )}
        </Application>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
        <div className="flex flex-col items-center">
          <h2 className="text-white text-2xl sm:text-3xl font-bold drop-shadow-md">Dealer</h2>
          <p className="text-emerald-100 text-sm">Score: {dealerDisplayScore}</p>
          {isGameStarted && !isGameOver && currentTurnUsername && (
            <div className="mt-3 flex items-center gap-3">
              <div className="px-4 py-2 bg-amber-400 text-amber-900 rounded-full font-bold text-sm shadow-lg">
                🎯 {isMyTurn ? "Your Turn!" : `${currentTurnUsername}'s Turn`}
              </div>
              {roundTimeLeft > 0 && (
                <div className={`px-3 py-2 rounded-full font-bold text-sm shadow-lg ${
                  roundTimeLeft <= 10 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-white/90 text-gray-800'
                }`}>
                  ⏱️ {roundTimeLeft}s
                </div>
              )}
            </div>
          )}
        </div>

        {isGameOver && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white/95 border-2 border-amber-400 rounded-xl px-6 sm:px-12 py-6 sm:py-8 text-center max-h-[80vh] flex flex-col mb-20 sm:mb-40 shadow-xl max-w-sm sm:max-w-md w-full">
              {winners.length > 0 ? (
                <>
                  <h2 className="text-amber-600 text-2xl sm:text-4xl font-bold mb-4">
                    🎉 WINNERS!
                  </h2>
                  <div className="text-gray-800 text-lg sm:text-2xl space-y-2 overflow-y-auto max-h-[60vh] pointer-events-auto pr-2">
                    {winners.map((winner, idx) => (
                      <div key={idx} className="font-semibold">
                        {winner}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-gray-600 text-2xl sm:text-4xl font-bold">Nobody won...</h2>
                  <p className="text-gray-500 text-base sm:text-lg mt-2">Better luck next round!</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* split other players' info on left and right hand side of screen on top of their hands (desktop only) */}

        {!isMobile && leftPlayers.length > 0 && (
          <div className="absolute">
            {leftPlayers.map((other, idx) => (
              <div
                key={other.username}
                className={`px-3 py-2 rounded-lg shadow-md absolute transition-all ${
                  other.isCurrentTurn 
                    ? 'bg-amber-200 ring-2 ring-amber-400' 
                    : 'bg-white/90'
                }`}
                style={{
                  left: `30px`,
                  top: `${sidePlayerStartY - 110 + idx * sidePlayerSpacing}px`,
                }}
              >
                <p className="text-gray-800 font-semibold text-sm">
                  {other.isCurrentTurn && '🎯 '}{other.username}
                </p>
                <p className="text-gray-600 text-xs">Score: {other.displayScore}</p>
              </div>
            ))}
          </div>
        )}

        {!isMobile && rightPlayers.length > 0 && (
          <div className="absolute">
            {rightPlayers.map((other, idx) => (
              <div
                key={other.username}
                className={`px-3 py-2 rounded-lg shadow-md absolute transition-all ${
                  other.isCurrentTurn 
                    ? 'bg-amber-200 ring-2 ring-amber-400' 
                    : 'bg-white/90'
                }`}
                style={{
                  left: `${windowSize.width - 220}px`,
                  top: `${sidePlayerStartY - 110 + idx * sidePlayerSpacing}px`,
                }}
              >
                <p className="text-gray-800 font-semibold text-sm">
                  {other.isCurrentTurn && '🎯 '}{other.username}
                </p>
                <p className="text-gray-600 text-xs">Score: {other.displayScore}</p>
              </div>
            ))}
          </div>
        )}

        {isMobile && otherPlayers.length > 0 && (
          <button
            className="absolute top-4 right-4 z-20 bg-white/90 hover:bg-white p-3 rounded-lg pointer-events-auto transition-colors shadow-md"
            onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            aria-label="Toggle players panel"
          >
            <div className="flex flex-col gap-1.5 w-6">
              <div className="h-0.5 bg-gray-700 rounded"></div>
              <div className="h-0.5 bg-gray-700 rounded"></div>
              <div className="h-0.5 bg-gray-700 rounded"></div>
            </div>
          </button>
        )}

        {/* mobile friendly way of showing other players' cards via side panel */}
        {isMobile && (
          <>
            {isSidePanelOpen && (
              <div
                className="absolute inset-0 bg-black/30 z-30 pointer-events-auto"
                onClick={() => setIsSidePanelOpen(false)}
              />
            )}

            <div
              className={`absolute top-0 right-0 h-full w-72 bg-white border-l-2 border-emerald-200 z-40 transition-transform duration-300 ease-in-out pointer-events-auto overflow-y-auto shadow-xl ${
                isSidePanelOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-gray-800 text-lg font-bold">Other Players</h3>
                  <button
                    onClick={() => setIsSidePanelOpen(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl transition-colors"
                    aria-label="Close panel"
                  >
                    x
                  </button>
                </div>

                {otherPlayers.length === 0 ? (
                  <p className="text-gray-500 text-sm">No other players</p>
                ) : (
                  <div className="space-y-4">
                    {otherPlayers.map((other) => (
                      <div
                        key={other.username}
                        className={`p-3 rounded-lg border ${
                          other.isCurrentTurn
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <p className="text-gray-800 font-semibold mb-1">
                          {other.isCurrentTurn && '🎯 '}{other.username}
                        </p>
                        <p className="text-gray-600 text-sm mb-2">Score: {other.displayScore}</p>
                        <div className="flex gap-1 flex-wrap">
                          {other.hand.map((card, idx) => (
                            <div
                              key={`${card.suit}-${card.rank}-${idx}`}
                              className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium"
                            >
                              {card.isHidden ? "?" : `${card.rank}`}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col items-center gap-4 sm:gap-6">
          <div className={`text-center px-4 py-2 rounded-lg shadow-md transition-all ${
            isMyTurn && isGameStarted && !isGameOver
              ? 'bg-amber-200 ring-2 ring-amber-400'
              : 'bg-white/90'
          }`}>
            <p className="text-emerald-800 text-xl sm:text-2xl font-bold">
              Score: {playerScore || "?"}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 pointer-events-auto pb-6 sm:pb-10 px-4">
            {!isGameStarted && isLeader && (
              <button
                className="px-4 sm:px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-lg transition-all active:scale-95 text-sm sm:text-base"
                onClick={handleStartGame}
              >
                START GAME
              </button>
            )}

            {isGameStarted && !isGameOver && (
              <>
                <button
                  className={`px-4 sm:px-6 py-2.5 text-white rounded-lg font-bold shadow-lg transition-all text-sm sm:text-base ${
                    canPlay
                      ? "bg-blue-600 hover:bg-blue-700 active:scale-95"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                  onClick={handleHit}
                  disabled={!canPlay}
                >
                  HIT
                </button>

                <button
                  className={`px-4 sm:px-6 py-2.5 text-white rounded-lg font-bold shadow-lg transition-all text-sm sm:text-base ${
                    canPlay
                      ? "bg-rose-600 hover:bg-rose-700 active:scale-95"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                  onClick={handleStand}
                  disabled={!canPlay}
                >
                  STAND
                </button>
              </>
            )}

            {isGameOver && (
              <>
                {isLeader && (
                  <button
                    className="px-4 sm:px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-lg transition-all active:scale-95 text-sm sm:text-base"
                    onClick={handleStartGame}
                  >
                    NEW ROUND
                  </button>
                )}
                {!isLeader && (
                  <div className="px-4 py-2.5 text-white/80 text-xs sm:text-sm bg-black/20 rounded-lg">
                    Waiting for leader to start new round...
                  </div>
                )}
              </>
            )}

            <button
              className="px-3 sm:px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold shadow-lg transition-all active:scale-95 text-sm sm:text-base"
              onClick={handleLeave}
            >
              LEAVE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Blackjack;
