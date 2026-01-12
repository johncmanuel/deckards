import { type Card as ServerCard } from "@deckards/common";

// client-side type!
export type Card = {
  suit: string;
  rank: string;
  asset: string;
  isHidden: boolean;
};

export const CARD_DIR = "/cards/";
export const CARD_BACK = `${CARD_DIR}card_back.png`;

export const ASSET_SUIT = ["spades", "hearts", "clubs", "diamonds"];
export const ASSET_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// converts server card format to client format
// server uses single-letter suit codes: "H", "D", "C", "S",
// it follows this format since it's more compact when transmitting over the network
// example usage: "H" -> "hearts", "D" -> "diamonds"
export const SUIT_MAP: Record<string, string> = {
  H: "hearts",
  D: "diamonds",
  C: "clubs",
  S: "spades",
};

// Kenney's card assets use two-digit ranks, using leading zeros for single-digit numbers
export const formatRank = (rank: string) => {
  let r = rank;

  if (parseInt(rank) < 10 && !isNaN(parseInt(rank))) {
    r = `0${rank}`;
  }

  return r;
};

export const cardAsset = (suit: string, rank: string) => {
  // example output: /cards/card_spades_02.png
  return `${CARD_DIR}card_${suit}_${formatRank(rank)}.png`;
};

export const getAllCardAssets = (): string[] => {
  const allCardAssets: string[] = [];

  ASSET_SUIT.forEach((suit) => {
    const clientSuitName = SUIT_MAP[suit] || suit.toLowerCase();
    ASSET_RANKS.forEach((rank) => {
      allCardAssets.push(cardAsset(clientSuitName, rank));
    });
  });

  return allCardAssets;
};

export const serverCardToClientCard = (serverCard: ServerCard): Card => {
  return {
    suit: serverCard.suit,
    rank: serverCard.rank,
    asset: cardAsset(SUIT_MAP[serverCard.suit] || serverCard.suit.toLowerCase(), serverCard.rank),
    isHidden: serverCard.isHidden,
  };
};
