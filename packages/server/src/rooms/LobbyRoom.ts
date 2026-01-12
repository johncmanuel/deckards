import { Room, Client, matchMaker } from "@colyseus/core";
import {
  Player,
  GameState,
  ACTIVE_GAMES,
  ACTIVITIES,
  type VoteGameMessage,
} from "@deckards/common";

export class LobbyRoom extends Room<GameState> {
  onCreate(options: any) {
    this.state = new GameState();

    this.onMessage("start_game", async (client, message: VoteGameMessage) => {
      if (client.sessionId !== this.state.lobbyLeader) {
        console.warn(`Non-leader ${client.sessionId} attempted to start game`);
        client.send("error", { message: "Only the lobby leader can start the game." });
        return;
      }
      console.log(`Lobby leader ${client.sessionId} starting ${message.game}`);

      // shouldn't happen since in client side, there'll be buttons that always send valid games
      // but adding this to make sure
      if (!(message.game in ACTIVE_GAMES)) {
        console.warn(`Invalid game selection: ${message.game}`);
        client.send("error", { message: "Invalid game selection." });
        return;
      }

      this.state.activeGame = message.game;
      this.state.currentActivity = ACTIVITIES.PLAYING;

      try {
        const reservations: Map<string, any> = new Map();
        const channelId = this.metadata?.channelId || options.channelId;

        for (const [sessionId, player] of this.state.players.entries()) {
          const reservation = await matchMaker.joinOrCreate("blackjack", {
            username: player.username,
            channelId: channelId,
            isLeader: sessionId === this.state.lobbyLeader,
          });

          reservations.set(sessionId, reservation);

          const targetClient = Array.from(this.clients).find((c) => c.sessionId === sessionId);
          if (targetClient) {
            targetClient.send("seat_reservation", {
              reservation: reservation,
              game: message.game,
            });
          }
        }
        console.log(`Created ${reservations.size} reservations for ${message.game}`);
      } catch (e) {
        console.error("Error creating game reservations:", e);
        this.broadcast("error", { message: "Failed to create game room." });
      }
    });
  }

  // TODO: account for players joining w/ discord context
  onJoin(client: Client, options: any) {
    console.log(options.username, "joined:", options.channelId);

    if (this.state.players.size === 0) {
      this.state.lobbyLeader = client.sessionId;
      console.log(`${options.username} is the lobby leader`);
    }

    // store channelId in room metadata for later use
    if (!this.metadata) {
      this.setMetadata({ channelId: options.channelId });
    }

    const newPlayer = new Player(
      client.sessionId,
      options.username || "Guest",
      options.avatarUrl || "",
    );

    this.state.players.set(client.sessionId, newPlayer);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(this.state.players.get(client.sessionId)?.username, "left!");
    this.state.players.delete(client.sessionId);

    if (client.sessionId === this.state.lobbyLeader) {
      const remainingPlayers = Array.from(this.state.players.keys());
      if (remainingPlayers.length > 0) {
        this.state.lobbyLeader = remainingPlayers[0];
        console.log(`New lobby leader: ${this.state.lobbyLeader}`);
      } else {
        this.state.lobbyLeader = "";
      }
    }
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
