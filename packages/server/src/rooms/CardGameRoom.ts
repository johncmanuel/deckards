import { Room, Client } from "colyseus";
import { GameState, Card } from "@deckards/common";

export abstract class CardGameRoom<TState extends GameState> extends Room<TState> {
  protected SUITS = ["H", "D", "C", "S"];
  protected RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  onCreate(options: any) {
    // setting state is done by child classes!

    this.onMessage("play_card", (client, message) => {
      this.handleCardPlay(client, message.cardIndex);
    });
  }

  generateDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of this.SUITS) {
      for (const rank of this.RANKS) {
        deck.push(new Card(suit, rank));
      }
    }
    return deck;
  }

  shuffleDeck() {
    const tempDeck = this.generateDeck();

    // Fisher-Yates Shuffle
    for (let i = tempDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tempDeck[i], tempDeck[j]] = [tempDeck[j], tempDeck[i]];
    }

    this.state.deck.clear();
    tempDeck.forEach((card) => this.state.deck.push(card));
  }

  dealCards(amount: number) {
    this.state.players.forEach((player) => {
      for (let i = 0; i < amount; i++) {
        if (this.state.deck.length > 0) {
          const card = this.state.deck.pop();
          if (card) {
            // TODO: use Schema Filters instead of below to hide this from opponents
            card.isHidden = false;
            player.hand.push(card);
          }
        }
      }
    });
  }

  protected abstract handleCardPlay(client: Client, cardIndex: number): void;
}
