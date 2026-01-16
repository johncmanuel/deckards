# intended to run from the root dir
FROM oven/bun:alpine 

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/server/package.json ./packages/server/
COPY packages/common/package.json ./packages/common/

# copy client package.json to avoid bun lockfile issues 
# but don't copy the client src code
COPY packages/client/package.json ./packages/client/

RUN bun install --production

COPY packages/common/src ./packages/common/src
COPY packages/server/src ./packages/server/src

# i'll add this just in case it's needed
COPY packages/server/ecosystem.config.cjs ./packages/server/ecosystem.config.cjs

# remove anything client related
RUN rm -rf packages/client

EXPOSE 2567
ENV NODE_ENV=production
USER bun

CMD ["bun", "packages/server/src/index.ts"]