import { Client } from "colyseus";
import { CardGameRoom } from "./CardGameRoom";
import { BlackjackPlayer, BlackjackState } from "@deckards/common";
import { calculateHandScore } from "../utils/blackjack";

export class BlackjackRoom extends CardGameRoom<BlackjackState> {
  onCreate(options: any) {
    this.state = new BlackjackState();

    super.onCreate(options);

    this.onMessage("start_game", (client) => this.startRound());
    this.onMessage("hit", (client) => this.handleHit(client));
    this.onMessage("stand", (client) => this.handleStand(client));
  }

  startRound() {
    this.lock();
    this.shuffleDeck();

    this.state.players.forEach((p) => {
      const player = p as BlackjackPlayer;
      player.hand.clear();
      player.isBusted = false;
      player.isStanding = false;
      player.roundScore = 0;
    });

    this.state.dealerHand.clear();
    this.state.dealerScore = 0;

    // deal the initial 2 cards to everyone simultaneously
    this.dealCards(2);

    if (this.state.deck.length >= 2) {
      const upCard = this.state.deck.pop();
      const holeCard = this.state.deck.pop();

      if (upCard) {
        upCard.isHidden = false;
        this.state.dealerHand.push(upCard);
      }
      if (holeCard) {
        holeCard.isHidden = true;
        this.state.dealerHand.push(holeCard);
      }
    }

    this.updateScores();
  }

  handleHit(client: Client) {
    const player = this.state.players.get(client.sessionId) as BlackjackPlayer;

    // Can only hit if not standing and not busted
    if (!player || player.isStanding || player.isBusted) return;

    const card = this.state.deck.pop();
    if (card) {
      card.isHidden = false;
      player.hand.push(card);

      this.updateScores();

      // Auto-Stand if busted or hit 21
      if (player.roundScore >= 21) {
        if (player.roundScore > 21) player.isBusted = true;
        this.handleStand(client);
      }
    }
  }

  handleStand(client: Client) {
    const player = this.state.players.get(client.sessionId) as BlackjackPlayer;
    if (!player) return;

    player.isStanding = true;

    // After every stand, check if we need to proceed to Dealer turn
    this.checkForRoundCompletion();
  }

  updateScores() {
    this.state.players.forEach((p) => {
      const player = p as BlackjackPlayer;
      player.roundScore = calculateHandScore(player.hand);
    });

    // Calculate dealer score based ONLY on visible cards?
    // Usually in state we store the *real* score, but frontend only shows visible.
    this.state.dealerScore = calculateHandScore(this.state.dealerHand);
  }

  checkForRoundCompletion() {
    // Check if EVERY player is either Standing or Busted
    const allPlayersDone = Array.from(this.state.players.values()).every((p) => {
      const player = p as BlackjackPlayer;
      return player.isStanding || player.isBusted;
    });

    if (allPlayersDone) {
      this.playDealerTurn();
    }
  }

  async playDealerTurn() {
    const holeCard = this.state.dealerHand.at(1);
    if (holeCard) {
      holeCard.isHidden = false;
    }

    // Dealer must Hit on Soft 16, Stand on 17
    while (this.state.dealerScore < 17) {
      this.clock.setTimeout(() => {
        console.log("Dealer draws a card");
      }, 1000);

      const card = this.state.deck.pop();
      if (card) {
        card.isHidden = false;
        this.state.dealerHand.push(card);
        this.updateScores();
      }
    }

    this.clock.setTimeout(() => {
      console.log("Dealer turn complete");
    }, 1000);
    this.determineWinners();
  }

  determineWinners() {
    const dealerScore = this.state.dealerScore;
    const dealerBust = dealerScore > 21;

    this.state.players.forEach((p) => {
      const player = p as BlackjackPlayer;
      if (player.isBusted) {
        // Player Busted -> Lose
        // You might add a message: client.send("result", "LOSE");
        console.log(`${player.username} busted and loses.`);
      } else if (dealerBust) {
        // Dealer Busted -> Win
        console.log(`${player.username} wins! Dealer busted.`);
      } else if (player.roundScore > dealerScore) {
        // Higher Score -> Win
        console.log(`${player.username} wins against dealer!`);
      } else if (player.roundScore === dealerScore) {
        // Push (Tie) -> No score change
        console.log(`${player.username} pushes with dealer.`);
      } else {
        // Lower Score -> Lose
        console.log(`${player.username} loses to dealer.`);
      }
    });

    // Broadcast event to show "Round Over" screen
    this.broadcast("game_over");

    this.clock.setTimeout(() => this.unlock(), 3000);
  }

  handleCardPlay(client: Client, cardIndex: number) {}
}
