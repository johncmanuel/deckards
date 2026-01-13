import { Schema, MapSchema, type, ArraySchema, view } from "@colyseus/schema";

export class Card extends Schema {
  @type("string") suit: string; // "H", "D", "C", "S"
  @type("string") rank: string; // "2", "3", ... "K", "A"
  @type("boolean") isHidden: boolean = true; // if true, player only sees card back
  @type("string") ownerId: string; // sessionId of owning player; leave blank or whatever if in non-player deck

  constructor(suit: string, rank: string, ownerId: string = "") {
    super();
    this.suit = suit;
    this.rank = rank;
    this.ownerId = ownerId;
  }
}

export class Player extends Schema {
  @type("string") id: string;
  @type("string") username: string;
  @type("string") avatarUrl: string;
  @type("boolean") isReady: boolean = false;

  /*@view()*/ @type([Card]) hand = new ArraySchema<Card>();

  constructor(id: string, username: string, avatarUrl: string) {
    super();
    this.id = id;
    this.username = username;
    this.avatarUrl = avatarUrl;
  }
}

export const ACTIVE_GAMES = {
  NONE: "NONE",
  BLACKJACK: "BLACKJACK",
  BS: "BS",
};

export const ACTIVITIES = {
  LOBBY: "LOBBY",
  PLAYING: "PLAYING",
};

export type VoteGameMessage = {
  game: keyof typeof ACTIVE_GAMES;
};

export class GameState extends Schema {
  @type("string") currentActivity = ACTIVITIES.LOBBY;
  @type("string") activeGame = ACTIVE_GAMES.NONE;

  // "sessionId" => Player
  @type({ map: Player }) players = new MapSchema<Player>();

  // Central pile
  @type([Card]) deck = new ArraySchema<Card>();

  // stores the session ID of the player whose turn it is
  @type("string") currentTurn: string = "";

  // stores the session ID of the lobby leader
  @type("string") lobbyLeader: string = "";
}
