import { type, ArraySchema } from "@colyseus/schema";
import { Player, GameState, Card } from "./GameState";

export class BlackjackPlayer extends Player {
  @type("boolean") isStanding: boolean = false;
  @type("boolean") isBusted: boolean = false;
  @type("number") roundScore: number = 0;
}

export class BlackjackState extends GameState {
  // @type({ map: BlackjackPlayer }) players = new MapSchema<BlackjackPlayer>();
  @type("number") dealerScore: number = 0;
  @type([Card]) dealerHand = new ArraySchema<Card>();
  @type("string") gameLeader: string = "";
}
