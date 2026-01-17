import { Client } from "colyseus";
import { CardGameRoom } from "./CardGameRoom";
import {
  BlackjackPlayer,
  BlackjackState,
  ServerMultiplayerError,
  type GameOverResults,
} from "@deckards/common";
import { Delayed } from "colyseus";
import { calculateHandScore } from "@deckards/common";
// import { StateView } from "@colyseus/schema";

interface GlobalTimers {
  timeout: Delayed;
  interval: Delayed;
}

export class BlackjackRoom extends CardGameRoom<BlackjackState> {
  private autoStartTimer?: Delayed;
  private globalTimer?: GlobalTimers;

  private readonly AUTO_START_DELAY_MS = 10 * 1000;
  private readonly ROUND_TIME_LIMIT_MS = 20 * 1000;

  // TODO: create types for the options below

  onCreate(options: any) {
    this.state = new BlackjackState();

    super.onCreate(options);

    this.onMessage("start_game", (client) => {
      if (client.sessionId !== this.state.gameLeader) {
        console.warn(`Non-leader ${client.sessionId} attempted to start round`);
        const msg: ServerMultiplayerError = {
          message: "Only the game leader can start a new round.",
        };
        client.send("error", msg);
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
      const msg: ServerMultiplayerError = { message: "Maximum number of active players reached." };
      client.send("error", msg);
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

    // client.view = new StateView(true);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(this.state.players.get(client.sessionId)?.username, "left!");
    this.state.players.delete(client.sessionId);

    // TODO: explore case where player leader leaves back to lobby and a round in the game ends;
    // who would start the next round?
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
    this.clearGlobalTimer();
  }

  startRound() {
    this.clearAutoStartTimer();
    this.clearGlobalTimer();

    this.lock();
    this.shuffleDeck(6);

    this.broadcast("round_started");

    this.state.players.forEach((p) => {
      const player = p as BlackjackPlayer;
      player.hand.clear();
      player.isBusted = false;
      player.isStanding = false;
      player.roundScore = 0;
    });

    // this.clients.forEach((c) => {
    //   c.view.clear();
    // });

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
        // this.clients.forEach((c) => {
        //   if (c.view.has(upCard)) return;
        //   c.view.add(upCard);
        // });
      }
      if (holeCard) {
        holeCard.isHidden = true;
        this.state.dealerHand.push(holeCard);
      }
    }

    this.updateScores();

    const playerIds = Array.from(this.state.players.keys());
    if (playerIds.length > 0) {
      this.state.currentTurn = playerIds[0];
      this.startGlobalTimer();
    }
  }

  startGlobalTimer() {
    this.clearGlobalTimer();

    this.state.roundTimeLeft = this.ROUND_TIME_LIMIT_MS / 1000;

    const updateInterval = this.clock.setInterval(() => {
      if (this.state.roundTimeLeft > 0) {
        this.state.roundTimeLeft -= 1;
      }
    }, 1000);

    // Auto-stand current player when time runs out
    const timeoutTimer = this.clock.setTimeout(() => {
      console.log("Global timer expired, auto-standing current player");
      const currentPlayerId = this.state.currentTurn;
      if (currentPlayerId) {
        const client = Array.from(this.clients).find((c) => c.sessionId === currentPlayerId);
        const player = this.state.players.get(currentPlayerId) as BlackjackPlayer;
        console.log("Auto-standing player:", player?.username);
        if (client && player && !player.isStanding && !player.isBusted) {
          this.handleStand(client);
        }
      }
      updateInterval.clear();
    }, this.ROUND_TIME_LIMIT_MS);

    this.globalTimer = { timeout: timeoutTimer, interval: updateInterval };
  }

  clearGlobalTimer() {
    if (this.globalTimer) {
      this.globalTimer.timeout.clear();
      this.globalTimer.interval.clear();
      this.globalTimer = undefined;
    }
    this.state.roundTimeLeft = 0;
  }

  moveToNextPlayer() {
    const playerIds = Array.from(this.state.players.keys());
    const currIdx = playerIds.indexOf(this.state.currentTurn);

    // find next player who hasn't stood or busted
    for (let i = 1; i <= playerIds.length; i++) {
      const nextIndex = (currIdx + i) % playerIds.length;
      const nextPlayerId = playerIds[nextIndex];
      const nextPlayer = this.state.players.get(nextPlayerId) as BlackjackPlayer;

      // restart global timer for the next player
      // if no eligible players found,
      if (!nextPlayer.isStanding && !nextPlayer.isBusted) {
        this.state.currentTurn = nextPlayerId;
        this.startGlobalTimer();
        return;
      }
    }

    // if all players done, dealer goes next
    this.state.currentTurn = "";
    this.clearGlobalTimer();
    this.playDealerTurn();
  }

  handleHit(client: Client) {
    const player = this.state.players.get(client.sessionId) as BlackjackPlayer;

    // only hit if not standing and not busted
    if (!player || player.isStanding || player.isBusted) return;

    // only current player can act
    if (this.state.currentTurn !== client.sessionId) {
      const msg: ServerMultiplayerError = { message: "It's not your turn!" };
      client.send("error", msg);
      return;
    }

    const card = this.state.deck.pop();
    if (card) {
      card.isHidden = false;
      card.ownerId = player.id;
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

    // only current player can act (unless auto-standing from timeout)
    if (this.state.currentTurn !== client.sessionId && !player.isBusted) {
      const msg: ServerMultiplayerError = { message: "It's not your turn!" };
      client.send("error", msg);
      return;
    }

    player.isStanding = true;

    this.moveToNextPlayer();
  }

  updateScores() {
    this.state.players.forEach((p) => {
      const player = p as BlackjackPlayer;
      player.roundScore = calculateHandScore(player.hand);
    });

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
    this.clearGlobalTimer();

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
        card.ownerId = "";
        // this.clients.forEach((c) => {
        //   if (c.view.has(card)) return;
        //   c.view.add(card);
        // });
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
    const winners: string[] = [];

    this.state.players.forEach((p) => {
      const player = p as BlackjackPlayer;
      if (player.isBusted) {
        // Player Busted -> Lose
        console.log(`${player.username} busted and loses.`);
      } else if (dealerBust) {
        // Dealer Busted -> Win
        console.log(`${player.username} wins! Dealer busted.`);
        winners.push(player.username);
      } else if (player.roundScore > dealerScore) {
        // Higher Score -> Win
        console.log(`${player.username} wins against dealer!`);
        winners.push(player.username);
      } else if (player.roundScore === dealerScore) {
        // Push (Tie) -> No score change
        console.log(`${player.username} pushes with dealer.`);
      } else {
        // Lower Score -> Lose
        console.log(`${player.username} loses to dealer.`);
      }
    });

    const gameOverRes: GameOverResults = {
      winners,
      dealerScore,
      dealerBust,
    };
    this.broadcast("game_over", gameOverRes);

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

  dealCards(amount: number) {
    this.state.players.forEach((p) => {
      for (let i = 0; i < amount; i++) {
        if (this.state.deck.length > 0) {
          const card = this.state.deck.pop();
          if (card) {
            card.ownerId = p.id;
            p.hand.push(card);
          }
        }
      }
    });
  }
}
