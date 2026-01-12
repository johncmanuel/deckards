export enum SelectedGame {
  BLACKJACK = "BLACKJACK",
  BS = "BS",
}

export interface LobbyOptions {
  username: string;
  channelId?: string;
}

export interface LobbySeatReservationOptions {
  reservation: any; // don't want to add both client and server versions of colyseus in common to type check this, so leave it at any
  game: string;
}
