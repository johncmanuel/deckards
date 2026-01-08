import { Room, Client } from "@colyseus/core";
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
    this.onMessage("vote_game", (client, message: VoteGameMessage) => {
      // TODO: implement count votes to choose game rather than first player to choose game
      console.log(`${client.sessionId} voted for ${message.game}`);

      // shouldn't happen since in client side, there'll be buttons that always send valid games
      // but adding this to make sure
      if (!(message.game in ACTIVE_GAMES)) {
        console.warn(`Invalid game vote: ${message.game}`);
        return;
      }

      this.state.activeGame = message.game;
      this.state.currentActivity = ACTIVITIES.PLAYING;

      this.broadcast("switch_game", { game: message.game });
    });
  }

  onJoin(client: Client, options: any) {
    console.log(options.username, "joined:", options.channelId);

    // TODO: account for players joining w/ discord context
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
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
