import { Card } from "../rooms/schema/GameState";

export function calculateHandScore(hand: Card[] | any): number {
  let score = 0;
  let aces = 0;

  const cards = Array.from(hand) as Card[];

  for (const card of cards) {
    if (["J", "Q", "K"].includes(card.rank)) {
      score += 10;
    } else if (card.rank === "A") {
      aces += 1;
      score += 11;
    } else {
      // Parse "2" through "10"
      score += parseInt(card.rank);
    }
  }

  // Downgrade Aces from 11 to 1 if we are over 21
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }

  return score;
}
