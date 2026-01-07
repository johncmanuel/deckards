import { Schema, MapSchema, type, ArraySchema } from "@colyseus/schema";

export class Card extends Schema {
  @type("string") suit: string; // "H", "D", "C", "S"
  @type("string") rank: string; // "2", "3", ... "K", "A"
  @type("boolean") isHidden: boolean = true; // if true, player only sees card back

  constructor(suit: string, rank: string) {
    super();
    this.suit = suit;
    this.rank = rank;
  }
}

export class Player extends Schema {
  @type("string") id: string;
  @type("string") username: string;
  @type("string") avatarUrl: string;
  @type("boolean") isReady: boolean = false;

  @type([Card]) hand = new ArraySchema<Card>();

  constructor(id: string, username: string, avatarUrl: string) {
    super();
    this.id = id;
    this.username = username;
    this.avatarUrl = avatarUrl;
  }
}

export class GameState extends Schema {
  @type("string") currentActivity: "LOBBY" | "VOTING" | "PLAYING" = "LOBBY";
  @type("string") activeGame: "NONE" | "BLACKJACK" | "BS" = "NONE";

  // "sessionId" => Player
  @type({ map: Player }) players = new MapSchema<Player>();

  // Central pile
  @type([Card]) deck = new ArraySchema<Card>();

  // stores the session ID of the player whose turn it is
  @type("string") currentTurn: string = "";
}
