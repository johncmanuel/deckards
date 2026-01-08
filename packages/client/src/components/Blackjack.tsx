import { useState, useEffect } from "react";
import { extend, Application } from "@pixi/react";
import { Container, Sprite, Texture, TextureSource, Assets, DEPRECATED_SCALE_MODES } from "pixi.js";

extend({ Container, Sprite });

// some of the variables and types will be placed in @deckards/common later;
// this is currently for prototyping purposes

type Card = {
  suit: string;
  rank: string;
  asset: string;
};

const CARD_BACK = "/cards/card_back.png";

const SUITS = ["spades", "hearts", "clubs", "diamonds"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function cardAsset(suit: string, rank: string) {
  let r = rank;

  // Add leading zero
  if (parseInt(rank) < 10) r = `0${rank}`;

  // example result: /cards/card_spades_02.png
  return `/cards/card_${suit.toLowerCase()}_${r}.png`;
}

function getRandomCard(): Card {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  return {
    suit,
    rank,
    asset: cardAsset(suit, rank),
  };
}

export function Blackjack() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);

  useEffect(() => {
    async function loadAssets() {
      try {
        // Set pixel art scaling mode globally before loading
        TextureSource.defaultOptions.scaleMode = DEPRECATED_SCALE_MODES.NEAREST;

        const allCardAssets = [CARD_BACK];
        SUITS.forEach((suit) => {
          RANKS.forEach((rank) => {
            allCardAssets.push(cardAsset(suit, rank));
          });
        });

        await Assets.load(allCardAssets);

        setPlayerHand([getRandomCard(), getRandomCard()]);
        setDealerHand([getRandomCard(), getRandomCard()]);

        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load assets", err);
      }
    }

    loadAssets();
  }, []);

  const getTexture = (url: string) => {
    try {
      return Texture.from(url);
    } catch {
      return Texture.EMPTY;
    }
  };

  const handleHit = () => {
    const newCard = getRandomCard();
    setPlayerHand((prev) => [...prev, newCard]);
  };

  const handleStand = () => {
    console.log("Player stands");
    setDealerHand((prev) => [...prev, getRandomCard()]);
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
            texture={getTexture(c.asset)}
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
        <Application resizeTo={window} backgroundAlpha={0} resolution={1}>
          {/* Dealer Hand */}
          <RenderHand hand={dealerHand} startX={window.innerWidth / 2 - cardWidth} startY={100} />

          {/* Player Hand */}
          <RenderHand hand={playerHand} startX={window.innerWidth / 2 - cardWidth} startY={400} />
        </Application>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
        <div className="flex flex-col items-center">
          <h2 className="text-yellow-400 text-3xl font-bold drop-shadow-md">Dealer</h2>
          <p className="text-yellow-200/80 text-sm">Score: ??</p>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-green-400 text-3xl font-bold drop-shadow-md">Player</h2>
            <p className="text-green-200/80 text-sm">Score: ??</p>
          </div>

          <div className="flex gap-4 pointer-events-auto pb-10">
            <button
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold shadow-lg transition-transform active:scale-95"
              onClick={handleHit}
            >
              HIT
            </button>

            <button
              className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold shadow-lg transition-transform active:scale-95"
              onClick={handleStand}
            >
              STAND
            </button>

            {/* for testing purposes only! */}
            {/* <button 
              className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded shadow-lg"
              onClick={() => {
                 setPlayerHand([getRandomCard(), getRandomCard()]);
                 setDealerHand([getRandomCard(), getRandomCard()]);
              }}
            >
              RESET
            </button> */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Blackjack;
