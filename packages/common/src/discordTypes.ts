export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string | null;
}

export interface DiscordTokenResponse {
  access_token: string;
  token: string; // Colyseus JWT
  user: DiscordUser;
}

export {};
