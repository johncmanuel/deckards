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

  // deals specified amount of cards to each player from the room wide deck
  // (everyone shares the same standard deck, though this could be modified per game)
  // TODO: modify this to deal differently per game type; so far it's
  // only meant for blackjack
  dealCards(amount: number) {
    this.state.players.forEach((p) => {
      for (let i = 0; i < amount; i++) {
        if (this.state.deck.length > 0) {
          const card = this.state.deck.pop();
          if (card) {
            // Mark first card as hidden (hole card)
            // card.isHidden = i === 0;

            // add card to each client's view
            // this.clients.forEach((c) => {
            //   if (c.view.has(card)) return;
            //   c.view.add(card);
            // });

            card.ownerId = p.id;

            p.hand.push(card);
          }
        }
      }
    });
  }

  protected abstract handleCardPlay(client: Client, cardIndex: number): void;
}
