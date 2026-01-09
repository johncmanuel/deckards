import { useState, useEffect } from "react";
import { extend, Application } from "@pixi/react";
import { Container, Sprite, Texture, TextureSource, Assets, DEPRECATED_SCALE_MODES } from "pixi.js";
import { Room } from "colyseus.js";
import {
  BlackjackState,
  type BlackjackPlayer,
  type Card as ServerCard,
  calculateHandScore,
} from "@deckards/common";
import { isDevelopment } from "../utils/envVars";

extend({ Container, Sprite });

// some of the variables and types will be placed in @deckards/common later;
// this is currently for prototyping purposes

type Card = {
  suit: string;
  rank: string;
  asset: string;
  isHidden: boolean;
};

const CARD_BACK = "/cards/card_back.png";

const SUIT_MAP: Record<string, string> = {
  H: "hearts",
  D: "diamonds",
  C: "clubs",
  S: "spades",
};

function cardAsset(suit: string, rank: string) {
  let r = rank;

  // Add leading zero for single digit numbers
  if (parseInt(rank) < 10 && !isNaN(parseInt(rank))) {
    r = `0${rank}`;
  }

  // Convert server suit format to asset name
  const suitName = SUIT_MAP[suit] || suit.toLowerCase();

  // example result: /cards/card_spades_02.png
  return `/cards/card_${suitName}_${r}.png`;
}

function serverCardToClientCard(serverCard: ServerCard): Card {
  return {
    suit: serverCard.suit,
    rank: serverCard.rank,
    asset: cardAsset(serverCard.suit, serverCard.rank),
    isHidden: serverCard.isHidden,
  };
}

function calculateVisibleScore(hand: Card[]): number {
  // Filter out hidden cards and calculate score using shared utility
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
  const [otherPlayers, setOtherPlayers] = useState<
    Array<{ username: string; hand: Card[]; score: number; displayScore: string }>
  >([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [dealerScore, setDealerScore] = useState(0);
  const [dealerDisplayScore, setDealerDisplayScore] = useState<string>("?");
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [debugPlayers, setDebugPlayers] = useState<
    Array<{ username: string; hand: Card[]; score: number; displayScore: string }>
  >([]);

  useEffect(() => {
    async function loadAssets() {
      try {
        // Set pixel art scaling mode globally before loading
        TextureSource.defaultOptions.scaleMode = DEPRECATED_SCALE_MODES.NEAREST;

        // TODO: rework some of the logic here
        const allCardAssets = [CARD_BACK];
        const suits = ["spades", "hearts", "clubs", "diamonds"];
        const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

        suits.forEach((suit) => {
          ranks.forEach((rank) => {
            let r = rank;
            if (parseInt(rank) < 10 && !isNaN(parseInt(rank))) {
              r = `0${rank}`;
            }
            allCardAssets.push(`/cards/card_${suit}_${r}.png`);
          });
        });

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

    const updateGameState = () => {
      const currentPlayer = room.state.players.get(room.sessionId) as BlackjackPlayer | undefined;

      setIsLeader(room.sessionId === room.state.gameLeader);

      if (currentPlayer) {
        const playerCards = Array.from(currentPlayer.hand).map((serverCard) => {
          const card = serverCardToClientCard(serverCard);
          return { ...card, isHidden: false }; // always show own cards
        });

        setPlayerHand(playerCards);
        setPlayerScore(currentPlayer.roundScore);
        setCanPlay(!currentPlayer.isBusted && !currentPlayer.isStanding);
      }

      // update other players
      // TODO: this could be exploited by other clients to see hidden cards
      // need to implement Schema Filters on server and modify the below logic to
      // adapt to these filters
      const others: Array<{ username: string; hand: Card[]; score: number; displayScore: string }> =
        [];
      room.state.players.forEach((p, sessionId) => {
        if (sessionId !== room.sessionId) {
          const player = p as BlackjackPlayer;
          const hand = Array.from(player.hand).map(serverCardToClientCard);
          others.push({
            username: player.username,
            hand: hand,
            score: player.roundScore,
            displayScore: formatObfuscatedScore(hand, player.roundScore),
          });
        }
      });
      setOtherPlayers(others);

      const dealerCards = Array.from(room.state.dealerHand).map(serverCardToClientCard);
      setDealerHand(dealerCards);
      setDealerScore(room.state.dealerScore);
      setDealerDisplayScore(formatObfuscatedScore(dealerCards, room.state.dealerScore));

      // game starts if there are cards
      setIsGameStarted(dealerCards.length > 0 || (currentPlayer?.hand.length ?? 0) > 0);
    };

    updateGameState();

    room.onStateChange(updateGameState);

    room.onMessage("game_over", () => {
      setIsGameOver(true);
      setCanPlay(false);
    });

    room.onMessage("round_started", () => {
      setIsGameOver(false);
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

  const cardWidth = 96;
  const cardHeight = 144;

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

  const allOtherPlayers = isDevelopment ? [...otherPlayers, ...debugPlayers] : otherPlayers;
  const leftPlayers = allOtherPlayers.slice(0, 3);
  const rightPlayers = allOtherPlayers.slice(3);

  return (
    <div className="relative w-screen h-screen bg-[#101010] overflow-hidden">
      <div className="absolute inset-0 z-0">
        {/* show the hands */}
        <Application resizeTo={window} backgroundAlpha={0} resolution={1}>
          {dealerHand.length > 0 && (
            <RenderHand hand={dealerHand} startX={window.innerWidth / 2 - cardWidth} startY={100} />
          )}

          {/* split other players' hands on left and right hand side of screen  */}

          {leftPlayers.map((other, idx) => (
            <RenderHand
              key={other.username}
              hand={other.hand}
              startX={50}
              startY={200 + idx * 270}
            />
          ))}

          {rightPlayers.map((other, idx) => (
            <RenderHand
              key={other.username}
              hand={other.hand}
              startX={window.innerWidth - 200}
              startY={200 + idx * 270}
            />
          ))}

          {playerHand.length > 0 && (
            <RenderHand hand={playerHand} startX={window.innerWidth / 2 - cardWidth} startY={610} />
          )}
        </Application>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
        <div className="flex flex-col items-center">
          <h2 className="text-yellow-400 text-3xl font-bold drop-shadow-md">Dealer</h2>
          <p className="text-yellow-200/80 text-sm">Score: {dealerDisplayScore}</p>
        </div>

        {/* split other players' info on left and right hand side of screen on top of their hands */}

        {leftPlayers.length > 0 && (
          <div className="absolute">
            {leftPlayers.map((other, idx) => (
              <div
                key={other.username}
                className="bg-black/50 px-3 py-2 rounded absolute"
                style={{ left: `30px`, top: `${50 + idx * 280}px` }}
              >
                <p className="text-blue-400 font-semibold text-sm">{other.username}</p>
                <p className="text-blue-200/80 text-xs">Score: {other.displayScore}</p>
              </div>
            ))}
          </div>
        )}

        {rightPlayers.length > 0 && (
          <div className="absolute">
            {rightPlayers.map((other, idx) => (
              <div
                key={other.username}
                className="bg-black/50 px-3 py-2 rounded absolute"
                style={{ left: `${window.innerWidth - 220}px`, top: `${50 + idx * 280}px` }}
              >
                <p className="text-blue-400 font-semibold text-sm">{other.username}</p>
                <p className="text-blue-200/80 text-xs">Score: {other.displayScore}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-green-400 text-3xl font-bold drop-shadow-md">Player</h2>
            <p className="text-green-200/80 text-sm">Score: {playerScore || "?"}</p>
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
