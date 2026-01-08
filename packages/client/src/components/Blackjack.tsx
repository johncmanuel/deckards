import { useState, useEffect } from "react";
import { extend, Application } from "@pixi/react";
import { Container, Sprite, Texture, TextureSource, Assets, DEPRECATED_SCALE_MODES } from "pixi.js";
import { Room } from "colyseus.js";
import { BlackjackState, type BlackjackPlayer, type Card as ServerCard } from "@deckards/common";

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

export function Blackjack({ room }: { room?: Room<BlackjackState> }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [otherPlayers, setOtherPlayers] = useState<
    Array<{ username: string; hand: Card[]; score: number }>
  >([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [dealerScore, setDealerScore] = useState(0);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [canPlay, setCanPlay] = useState(false);

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

      if (currentPlayer) {
        const playerCards = Array.from(currentPlayer.hand).map(serverCardToClientCard);

        setPlayerHand(playerCards);
        setPlayerScore(currentPlayer.roundScore);
        setCanPlay(!currentPlayer.isBusted && !currentPlayer.isStanding);
      }

      // update other players
      const others: Array<{ username: string; hand: Card[]; score: number }> = [];
      room.state.players.forEach((p, sessionId) => {
        if (sessionId !== room.sessionId) {
          const player = p as BlackjackPlayer;
          others.push({
            username: player.username,
            hand: Array.from(player.hand).map(serverCardToClientCard),
            score: player.roundScore,
          });
        }
      });
      setOtherPlayers(others);

      const dealerCards = Array.from(room.state.dealerHand).map(serverCardToClientCard);
      setDealerHand(dealerCards);
      setDealerScore(room.state.dealerScore);

      // game starts if there are cards
      setIsGameStarted(dealerCards.length > 0 || (currentPlayer?.hand.length ?? 0) > 0);
    };

    updateGameState();

    room.onStateChange(updateGameState);

    room.onMessage("game_over", () => {
      setIsGameOver(true);
      setCanPlay(false);
    });

    return () => {
      room.removeAllListeners();
    };
  }, [room]);

  const handleStartGame = () => {
    if (room) {
      room.send("start_game");
      setIsGameOver(false);
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

  const visibleDealerScore = dealerHand.filter((c) => !c.isHidden).length > 0 ? dealerScore : "?";

  return (
    <div className="relative w-screen h-screen bg-[#101010] overflow-hidden">
      <div className="absolute inset-0 z-0">
        {/* show the hands */}
        <Application resizeTo={window} backgroundAlpha={0} resolution={1}>
          {dealerHand.length > 0 && (
            <RenderHand hand={dealerHand} startX={window.innerWidth / 2 - cardWidth} startY={100} />
          )}

          {otherPlayers.map((other, idx) => (
            <RenderHand
              key={other.username}
              hand={other.hand}
              startX={50}
              startY={200 + idx * 180}
            />
          ))}

          {playerHand.length > 0 && (
            <RenderHand hand={playerHand} startX={window.innerWidth / 2 - cardWidth} startY={630} />
          )}
        </Application>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
        <div className="flex flex-col items-center">
          <h2 className="text-yellow-400 text-3xl font-bold drop-shadow-md">Dealer</h2>
          <p className="text-yellow-200/80 text-sm">Score: {visibleDealerScore}</p>
        </div>

        {otherPlayers.length > 0 && (
          <div className="absolute left-8 top-[200px] flex flex-col gap-4">
            {otherPlayers.map((other, _) => (
              <div key={other.username} className="bg-black/50 px-3 py-2 rounded">
                <p className="text-blue-400 font-semibold text-sm">{other.username}</p>
                <p className="text-blue-200/80 text-xs">Score: {other.score || "?"}</p>
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
            {!isGameStarted && (
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
              <button
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold shadow-lg transition-transform active:scale-95"
                onClick={handleStartGame}
              >
                NEW ROUND
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Blackjack;
