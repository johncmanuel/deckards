import config from "@colyseus/tools";
import { monitor } from "@colyseus/monitor";
import { playground } from "@colyseus/playground";
import { JWT } from "@colyseus/auth";
import { json } from "express";
import type { DiscordTokenResponse, DiscordUser } from "@deckards/common";
import { SelectedGame, Activity } from "@deckards/common";

/**
 * Import your Room files
 */
import { LobbyRoom } from "./rooms/LobbyRoom";
import { BlackjackRoom } from "./rooms/BlackjackRoom";

export default config({
  // options: {
  //   devMode: process.env.NODE_ENV !== "production",
  // },

  initializeGameServer: (gameServer) => {
    /**
     * Define your room handlers:
     */
    gameServer.define(Activity.LOBBY, LobbyRoom).filterBy(["channelId"]);
    gameServer.define(SelectedGame.BLACKJACK, BlackjackRoom);
  },

  initializeExpress: (app) => {
    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    app.get("/hello_world", (req, res) => {
      res.send("It's time to kick ass and chew bubblegum!");
    });

    app.use(json());

    // Source:
    // https://github.com/colyseus/discord-activity/blob/main/apps/server/src/app.config.ts
    app.post("/discord_token", async (req, res) => {
      if (process.env.NODE_ENV !== "production" && req.body.code === "mock_code") {
        const user: DiscordUser = {
          id: Math.random().toString(36).slice(2, 10),
          username: `User ${Math.random().toString().slice(2, 10)}`,
        };
        const payload: DiscordTokenResponse = {
          access_token: "mocked",
          token: await JWT.sign(user),
          user,
        };
        res.send(payload);
        console.log("Mock code used, returning mocked token and user.");
        return;
      }

      console.log("attempting to get discord token");

      try {
        const response = await fetch(`https://discord.com/api/oauth2/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code: req.body.code,
          }),
        });

        // discord access token
        const { access_token } = await response.json();

        // user data
        const profile = await (
          await fetch(`https://discord.com/api/users/@me`, {
            method: "GET",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Bearer ${access_token}`,
            },
          })
        ).json();

        const user: DiscordUser = profile;

        const payload: DiscordTokenResponse = {
          access_token,
          token: await JWT.sign(user), // Colyseus JWT token
          user,
        };

        res.status(200).send(payload);
      } catch (e: any) {
        res.status(400).send({ error: e.message });
      }
    });

    /**
     * Use @colyseus/playground
     * (It is not recommended to expose this route in a production environment)
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/", playground());
    }

    /**
     * Use @colyseus/monitor
     * It is recommended to protect this route with a password
     * Read more: https://docs.colyseus.io/tools/monitor/#restrict-access-to-the-panel-using-a-password
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/colyseus", monitor());
    }
  },

  beforeListen: () => {
    /**
     * Before before gameServer.listen() is called.
     */
  },
});
