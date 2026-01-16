import { Room, Client, AuthContext } from "colyseus";
import { GameState, Card } from "@deckards/common";

export abstract class CardGameRoom<TState extends GameState> extends Room<TState> {
  protected SUITS = ["H", "D", "C", "S"];
  protected RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  async onAuth(client: Client, options: any, authContext: AuthContext) {
    if (!options.auth) {
      throw new Error("Missing forwarded auth");
    }

    return options.auth;
  }

  onCreate(options: any) {
    // setting state is done by child classes!

    this.onMessage("play_card", (client, message) => {
      this.handleCardPlay(client, message.cardIndex);
    });
  }

  onJoin(client: Client, options: any) {
    // will explicitly define it here (as empty) as a reminder that card rooms can override this
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

  generateDeck(numDecks: number = 1): Card[] {
    const deck: Card[] = [];
    for (let deckNum = 0; deckNum < numDecks; deckNum++) {
      for (const suit of this.SUITS) {
        for (const rank of this.RANKS) {
          deck.push(new Card(suit, rank));
        }
      }
    }
    return deck;
  }

  shuffleDeck(numDecks: number = 1) {
    const tempDeck = this.generateDeck(numDecks);

    // Fisher-Yates Shuffle
    for (let i = tempDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tempDeck[i], tempDeck[j]] = [tempDeck[j], tempDeck[i]];
    }

    this.state.deck.clear();
    tempDeck.forEach((card) => this.state.deck.push(card));
  }

  protected abstract dealCards(amount: number): void;

  protected abstract handleCardPlay(client: Client, cardIndex: number): void;
}
