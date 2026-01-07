// very useful reference for Discord SDK usage:
// https://github.com/colyseus/discord-activity/blob/main/apps/client/src/utils/DiscordSDK.ts

import { DiscordSDK, DiscordSDKMock } from "@discord/embedded-app-sdk";

export const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

if (!DISCORD_CLIENT_ID) {
  throw new Error("VITE_DISCORD_CLIENT_ID is not defined in environment variables");
}

const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get("frame_id") != null;

let discordSDK: DiscordSDK | DiscordSDKMock;

if (isEmbedded) {
  discordSDK = new DiscordSDK(DISCORD_CLIENT_ID);
} else {
  // @ts-ignore: shouldn't be a problem with the typings here
  enum SessionStorageQueryParam {
    user_id = "user_id",
    guild_id = "guild_id",
    channel_id = "channel_id",
  }

  function getOverrideOrRandomSessionValue(queryParam: `${SessionStorageQueryParam}`) {
    const overrideValue = queryParams.get(queryParam);
    if (overrideValue != null) {
      return overrideValue;
    }

    const currentStoredValue = sessionStorage.getItem(queryParam);
    if (currentStoredValue != null) {
      return currentStoredValue;
    }

    // Set queryParam to a random 8-character string
    const randomString = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(queryParam, randomString);

    return randomString;
  }

  const mockUserId = getOverrideOrRandomSessionValue("user_id");
  const mockGuildId = getOverrideOrRandomSessionValue("guild_id");
  const mockChannelId = "dummyChannelId";

  discordSDK = new DiscordSDKMock(DISCORD_CLIENT_ID, mockGuildId, mockChannelId, "en");
  const discriminator = String(mockUserId.charCodeAt(0) % 5);

  discordSDK._updateCommandMocks({
    authenticate: async () => {
      return await {
        access_token: "mock_token",
        user: {
          username: mockUserId,
          discriminator,
          id: mockUserId,
          avatar: null,
          public_flags: 1,
        },
        scopes: [],
        expires: new Date(2112, 1, 1).toString(),
        application: {
          description: "mock_app_description",
          icon: "mock_app_icon",
          id: "mock_app_id",
          name: "mock_app_name",
        },
      };
    },
  });
}

export { discordSDK, isEmbedded };
