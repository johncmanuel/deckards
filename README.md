# deckards

A collection of card game(s) playable as a Discord activity! Made with TypeScript, Bun, Colyseus.js. This was developed just to see how Discord activities work :)

<!-- Show demo here -->

The Discord activity is not yet public, since additional requirements set by Discord need to be fulfilled to make this happen. Because of these criteria, there will be a way to play this game outside of Discord in the future.

## Card Games List

So far, only Blackjack is supported. Other card games, like BS, will be added soon.

## Development Environment

Set up

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

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Deployment

There are 2 steps to setting this up: deploying the client and the server.

### Client

Deploying the client is the same as any React + Vite application. Use any popular cloud providers (i.e Cloudflare Workers, Vercel, etc.) that support the client stack for easy deployment. Self-hosting is an option too (though a Dockerfile should be supplied for Docker deployments). Ensure the root directory is set to `/packages/client` rather than `/`.  

### Server

The server is deployed mainly as a container. The container for the server can be visited [here](https://github.com/johncmanuel/deckards/pkgs/container/deckards-server). Use this for the latest changes. 

If wanted, the server's container image can be manually built using the command below:

```bash
docker build -t <name-of-server> -f packages/server/Dockerfile .
docker run -d <name-of-server>
```