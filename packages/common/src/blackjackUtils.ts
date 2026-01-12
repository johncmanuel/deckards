import { Card } from "./GameState";

export function calculateHandScore(hand: Card[] | any): number {
  let score = 0;
  let aces = 0;

  const cards = Array.from(hand) as Card[];

  for (const card of cards) {
    if (["J", "Q", "K"].includes(card.rank)) {
      score += 10;
    } else if (card.rank === "A") {
      // adjust ace values to get best score for player
      aces += 1;
      score += 11;
    } else {
      // parse "2" through "10"
      score += parseInt(card.rank);
    }
  }

  // downgrade aces from 11 to 1 if over 21
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }

  return score;
}
