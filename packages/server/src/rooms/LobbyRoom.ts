import { JWT } from "@colyseus/auth";
import { Room, Client, matchMaker, AuthContext } from "@colyseus/core";
import { SeatReservation } from "@colyseus/core/build/MatchMaker";
import {
  Player,
  GameState,
  SelectedGame,
  Activity,
  type VoteGameMessage,
  LobbyOptions,
} from "@deckards/common";

export class LobbyRoom extends Room<GameState> {
  private playersAuth: Map<string, AuthContext>;

  static onAuth(token: string) {
    return JWT.verify(token);
  }

  onCreate(options: any) {
    this.state = new GameState();
    this.playersAuth = new Map<string, AuthContext>();

    this.onMessage("start_game", async (client, message: VoteGameMessage) => {
      if (client.sessionId !== this.state.lobbyLeader) {
        console.warn(`Non-leader ${client.sessionId} attempted to start game`);
        client.send("error", { message: "Only the lobby leader can start the game." });
        return;
      }
      console.log(`Lobby leader ${client.sessionId} starting ${message.game}`);

      if (!Object.values(SelectedGame).includes(message.game)) {
        console.warn(`Invalid game selection: ${message.game}`);
        client.send("error", { message: "Invalid game selection." });
        return;
      }

      this.state.activeGame = message.game;
      this.state.currentActivity = Activity.PLAYING;

      try {
        const reservations: Map<string, SeatReservation> = new Map();
        const channelId = options.channelId;

        for (const [sessionId, player] of this.state.players.entries()) {
          const targetClient = Array.from(this.clients).find((c) => c.sessionId === sessionId);
          const auth = this.playersAuth.get(sessionId);

          const reservation = await matchMaker.joinOrCreate(message.game, {
            auth,
            username: player.username,
            channelId: channelId,
            isLeader: sessionId === this.state.lobbyLeader,
          });

          reservations.set(sessionId, reservation);

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

  // auth contains the data returned from the onAuth method
  // https://docs.colyseus.io/auth/room#server-onauth-method
  onJoin(client: Client, options: LobbyOptions, auth: AuthContext) {
    console.log(options.username, "joined:", options.channelId);

    if (this.state.players.size === 0) {
      this.state.lobbyLeader = client.sessionId;
      console.log(`${options.username} is the lobby leader`);
    }

    const newPlayer = new Player(
      client.sessionId,
      options.username || "Guest",
      // TODO: find way to get avatar URLs
      // @ts-ignore
      options.avatarUrl || "",
    );

    this.state.players.set(client.sessionId, newPlayer);
    this.playersAuth.set(client.sessionId, auth);
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
