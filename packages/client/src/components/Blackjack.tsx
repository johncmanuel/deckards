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
  const [dealerDisplayScore, setDealerDisplayScore] = useState<string>("?");
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const [windowSize, setWindowSize] = useState<WindowDimensions>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  const isMobile = windowSize.width < 768;

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

      if (currentPlayer) {
        const playerCards = Array.from(currentPlayer.hand ?? []).map((serverCard) => {
          const card = serverCardToClientCard(serverCard);
          return { ...card, isHidden: false }; // always show own cards
        });

        setPlayerHand(playerCards);
        setPlayerScore(currentPlayer.roundScore);
        setCanPlay(!currentPlayer.isBusted && !currentPlayer.isStanding);
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
  }: {
    hand: Card[];
    startX: number;
    startY: number;
  }) => {
    return (
      <pixiContainer x={startX} y={startY}>
        {hand.map((c, i) => (
          <pixiSprite
            key={`${c.suit}-${c.rank}-${i}`}
            texture={getTexture(c.isHidden ? CARD_BACK : c.asset)}
            x={i * 30} // overlap cards slightly
            y={0}
            width={cardWidth}
            height={cardHeight}
          />
        ))}
      </pixiContainer>
    );
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#101010] text-white">
        Loading Assets...
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-[#101010] overflow-hidden">
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
          <h2 className="text-yellow-400 text-3xl font-bold drop-shadow-md">Dealer</h2>
          <p className="text-yellow-200/80 text-sm">Score: {dealerDisplayScore}</p>
        </div>

        {isGameOver && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/80 border-4 border-yellow-400 rounded-lg px-12 py-8 text-center max-h-[80vh] flex flex-col mb-40">
              {winners.length > 0 ? (
                <>
                  <h2 className="text-yellow-400 text-4xl font-bold mb-4 drop-shadow-lg">
                    WINNERS!
                  </h2>
                  <div className="text-white text-2xl space-y-2 overflow-y-auto max-h-[60vh] pointer-events-auto pr-4">
                    {winners.map((winner, idx) => (
                      <div key={idx} className="font-semibold">
                        {winner}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-gray-400 text-4xl font-bold drop-shadow-lg">Nobody won...</h2>
                  <p className="text-gray-500 text-lg mt-2">Better luck next round!</p>
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
                className="bg-black/50 px-3 py-2 rounded absolute"
                style={{
                  left: `30px`,
                  top: `${sidePlayerStartY - 110 + idx * sidePlayerSpacing}px`,
                }}
              >
                <p className="text-blue-400 font-semibold text-sm">{other.username}</p>
                <p className="text-blue-200/80 text-xs">Score: {other.displayScore}</p>
              </div>
            ))}
          </div>
        )}

        {!isMobile && rightPlayers.length > 0 && (
          <div className="absolute">
            {rightPlayers.map((other, idx) => (
              <div
                key={other.username}
                className="bg-black/50 px-3 py-2 rounded absolute"
                style={{
                  left: `${windowSize.width - 220}px`,
                  top: `${sidePlayerStartY - 110 + idx * sidePlayerSpacing}px`,
                }}
              >
                <p className="text-blue-400 font-semibold text-sm">{other.username}</p>
                <p className="text-blue-200/80 text-xs">Score: {other.displayScore}</p>
              </div>
            ))}
          </div>
        )}

        {isMobile && otherPlayers.length > 0 && (
          <button
            className="absolute top-4 right-4 z-20 bg-black/70 hover:bg-black/90 p-3 rounded-lg pointer-events-auto transition-colors"
            onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            aria-label="Toggle players panel"
          >
            {/* like my amazing hamburger icon? */}
            <div className="flex flex-col gap-1.5 w-6">
              <div className="h-0.5 bg-white rounded"></div>
              <div className="h-0.5 bg-white rounded"></div>
              <div className="h-0.5 bg-white rounded"></div>
            </div>
          </button>
        )}

        {/* mobile friendly way of showing other players' cards via side panel */}
        {isMobile && (
          <>
            {isSidePanelOpen && (
              <div
                className="absolute inset-0 bg-black/50 z-30 pointer-events-auto"
                onClick={() => setIsSidePanelOpen(false)}
              />
            )}

            <div
              className={`absolute top-0 right-0 h-full w-72 bg-[#1a1a1a] border-l-2 border-yellow-400/30 z-40 transition-transform duration-300 ease-in-out pointer-events-auto overflow-y-auto ${
                isSidePanelOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-yellow-400 text-lg font-bold">Other Players</h3>
                  <button
                    onClick={() => setIsSidePanelOpen(false)}
                    className="text-white hover:text-yellow-400 text-2xl transition-colors"
                    aria-label="Close panel"
                  >
                    ×
                  </button>
                </div>

                {otherPlayers.length === 0 ? (
                  <p className="text-gray-400 text-sm">No other players</p>
                ) : (
                  <div className="space-y-4">
                    {otherPlayers.map((other) => (
                      <div
                        key={other.username}
                        className="bg-black/50 p-3 rounded-lg border border-blue-400/30"
                      >
                        <p className="text-blue-400 font-semibold mb-1">{other.username}</p>
                        <p className="text-blue-200/80 text-sm mb-2">Score: {other.displayScore}</p>
                        <div className="flex gap-1 flex-wrap">
                          {other.hand.map((card, idx) => (
                            <div
                              key={`${card.suit}-${card.rank}-${idx}`}
                              className="text-xs bg-white/10 px-2 py-1 rounded"
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

        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <p className="text-green-200/80 text-2xl">Score: {playerScore || "?"}</p>
          </div>

          <div className="flex gap-4 pointer-events-auto pb-10">
            {!isGameStarted && isLeader && (
              <button
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold shadow-lg transition-transform active:scale-95"
                onClick={handleStartGame}
              >
                START GAME
              </button>
            )}

            {isGameStarted && !isGameOver && (
              <>
                <button
                  className={`px-6 py-2 text-white rounded font-bold shadow-lg transition-transform ${
                    canPlay
                      ? "bg-blue-600 hover:bg-blue-500 active:scale-95"
                      : "bg-gray-600 cursor-not-allowed opacity-50"
                  }`}
                  onClick={handleHit}
                  disabled={!canPlay}
                >
                  HIT
                </button>

                <button
                  className={`px-6 py-2 text-white rounded font-bold shadow-lg transition-transform ${
                    canPlay
                      ? "bg-red-600 hover:bg-red-500 active:scale-95"
                      : "bg-gray-600 cursor-not-allowed opacity-50"
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
                    className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold shadow-lg transition-transform active:scale-95"
                    onClick={handleStartGame}
                  >
                    NEW ROUND
                  </button>
                )}
                {!isLeader && (
                  <div className="px-6 py-2 text-gray-400 text-sm">
                    Waiting for leader to start new round...
                  </div>
                )}
              </>
            )}

            <button
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold shadow-lg transition-transform active:scale-95"
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
