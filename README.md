# deckards

A collection of card game(s) playable as a Discord activity! Made with React, pixi.js, and Colyseus.js. This was developed just to see how Discord activities work :)

> The Discord activity is not yet public, since additional requirements set by Discord need to be fulfilled to make this happen. Because of these criteria, there will be a way to play this game outside of Discord in the future.

## Card Games List

So far, only Blackjack is supported. Other card games, like BS, will be added soon.

Blackjack demo:

https://github.com/user-attachments/assets/f3f5ec29-7e82-4a79-b0f1-572cc20977eb


## Development Environment

Install [bun](https://bun.com/docs/installation). Then create your Discord application [here](https://discord.com/developers/applications).

Create two `.env` files; one in `packages/client/` and another in `packages/server`. Both directories contain an `.env.example`. Copy the appropriate contents to the respective `.env` and fill in the values. Discord-related secrets can be obtained from the same site you created a Discord application on. `JWT_SECRET` for the server can be generated with the command:

```bash
bun jwt:gen
```

Copy the output and fill in the value for `JWT_SECRET`

To install dependencies:

```bash
bun install
```

To run the client and server simultaneously in development mode:

```bash
bun dev 
```

> NOTE: to reflect changes for the multiplayer server, you'll need to restart the development server. There is probably an option to hot reload it, but I haven't looked into it lately. 

To reflect changes in `packages/common/`

```bash
bun watch:common
```

To test in Discord, use `cloudflared` to expose your client to the internet. This allows Discord to reach your client. Ensure you're running both the client and server.

```bash
bun cloudflared
```

You should see a snippet like this in the output here:
```
2026-01-20T19:14:18Z INF +--------------------------------------------------------------------------------------------+
2026-01-20T19:14:18Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-01-20T19:14:18Z INF |  https://vintage-shuttle-balloon-reproduced.trycloudflare.com                              |
2026-01-20T19:14:18Z INF +--------------------------------------------------------------------------------------------+
```

Paste the URL given to you for the following fields in the Discord application:

Under: "OAuth2 → Redirect URL"
Under: "URL Mappings → Target" for root mapping `/`

Open the activity in Discord afterwards.

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Deployment

Deployment with a CI/CD pipeline via GitHub Actions is already set up. Though for those that want to deploy this for themselves, there are 2 steps to setting this up: deploying the client and the server.

### Client

Deploying the client is the same as any React + Vite application. Use any popular cloud providers (i.e., Cloudflare Workers, Vercel, etc.) that support the client stack for easy deployment. Self-hosting is also an option (though a Dockerfile should be provided for Docker deployments). Ensure the root directory is set to `/packages/client` rather than `/`.  

### Server

The server is deployed mainly as a container. The container for the server can be visited [here](https://github.com/johncmanuel/deckards/pkgs/container/deckards-server). Use this for the latest changes. 

If wanted, the server's container image can be manually built using the command below:

```bash
docker build -t <name-of-server> -f packages/server/Dockerfile .
docker run -d <name-of-server>
```

### Discord

Set the following fields for production. Ideally, you should have another Discord application purely for production rather than reusing the same one meant for development.

Under: "OAuth2 → Redirect URL", use the public URL for the deployed client.
Under: "URL Mappings → Target" for mapping `/`, use the public URL for the deployed client.
Under: "URL Mappings → Target" for mapping `/colyseus`, use the public URL for the deployed server.

## References

1. [https://github.com/colyseus/discord-activity/](https://github.com/colyseus/discord-activity/)
