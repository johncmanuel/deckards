import { Client } from "colyseus";
import { CardGameRoom } from "./CardGameRoom";
import { BlackjackPlayer, BlackjackState } from "@deckards/common";
import { Delayed } from "colyseus";
import { calculateHandScore } from "@deckards/common";

export class BlackjackRoom extends CardGameRoom<BlackjackState> {
  private autoStartTimer?: Delayed;
  private readonly AUTO_START_DELAY_MS = 10000;

  onCreate(options: any) {
    this.state = new BlackjackState();

    super.onCreate(options);

    this.onMessage("start_game", (client) => {
      if (client.sessionId !== this.state.gameLeader) {
        console.warn(`Non-leader ${client.sessionId} attempted to start round`);
        client.send("error", { message: "Only the game leader can start a new round." });
        return;
      }
      this.startRound();
    });
    this.onMessage("hit", (client) => this.handleHit(client));
    this.onMessage("stand", (client) => this.handleStand(client));
  }

  onJoin(client: Client, options: any) {
    console.log(options.username, "joined:", options.channelId, "in blackjack room");

    if (this.state.players.size >= this.state.maxActivePlayers) {
      console.warn(
        `${options.username} cannot join - max active players (${this.state.maxActivePlayers}) reached`,
      );
      client.send("error", { message: "Maximum number of active players reached." });
      client.leave();
      return;
    }

    if (options.isLeader) {
      this.state.gameLeader = client.sessionId;
      console.log(`${options.username} is the game leader (set from lobby)`);
    }
    // set leader based on join order if leader not already set
    else if (this.state.players.size === 0 && !this.state.gameLeader) {
      this.state.gameLeader = client.sessionId;
      console.log(`${options.username} is the game leader (first to join)`);
    }

    const newPlayer = new BlackjackPlayer(
      client.sessionId,
      options.username || "Guest",
      options.avatarUrl || "",
    );

    this.state.players.set(client.sessionId, newPlayer);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(this.state.players.get(client.sessionId)?.username, "left!");
    this.state.players.delete(client.sessionId);

    // if game leader leaves, assign a new leader
    if (client.sessionId === this.state.gameLeader) {
      const remainingPlayers = Array.from(this.state.players.keys());
      if (remainingPlayers.length > 0) {
        this.state.gameLeader = remainingPlayers[0];
        console.log(`New game leader: ${this.state.gameLeader}`);
      } else {
        this.state.gameLeader = "";
      }
    }
  }

  onDispose() {
    this.clearAutoStartTimer();
  }

  startRound() {
    this.clearAutoStartTimer();

    this.lock();
    this.shuffleDeck();

    this.broadcast("round_started");

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

    // only hit if not standing and not busted
    if (!player || player.isStanding || player.isBusted) return;

    const card = this.state.deck.pop();
    if (card) {
      // New cards from hits are always visible (not the first card)
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

    // after every stand, check if need to proceed to Dealer turn
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
    // reveal all players' first cards when game ends
    this.state.players.forEach((p) => {
      const player = p as BlackjackPlayer;
      if (player.hand.length > 0) {
        const firstCard = player.hand.at(0);
        if (firstCard) {
          firstCard.isHidden = false;
        }
      }
    });

    const dealerScore = this.state.dealerScore;
    const dealerBust = dealerScore > 21;

    this.state.players.forEach((p) => {
      const player = p as BlackjackPlayer;
      if (player.isBusted) {
        // Player Busted -> Lose
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

    this.broadcast("game_over");

    this.clock.setTimeout(() => this.unlock(), 3000);

    this.clearAutoStartTimer();

    this.autoStartTimer = this.clock.setTimeout(() => {
      console.log("Auto-starting new round...");
      this.startRound();
    }, this.AUTO_START_DELAY_MS);
  }

  clearAutoStartTimer() {
    if (this.autoStartTimer) {
      this.autoStartTimer.clear();
    }
  }

  handleCardPlay(client: Client, cardIndex: number) {}
}
