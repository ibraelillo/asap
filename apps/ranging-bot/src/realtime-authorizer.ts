import { realtime } from "sst/aws/realtime";
import { Resource } from "sst";

function getTopicPrefix(): string {
  try {
    return `${Resource.App.name}/${Resource.App.stage}/ranging-bot`;
  } catch {
    return "asap/dev/ranging-bot";
  }
}

function isValidToken(token: string): boolean {
  const expected = process.env.RANGING_REALTIME_TOKEN;
  if (!expected) return true;
  return token === expected;
}

export const handler = realtime.authorizer(async (token) => {
  const prefix = getTopicPrefix();
  const valid = isValidToken(token);

  return valid
    ? {
        principalId: "rangingdashboard",
        subscribe: [`${prefix}/*`],
        publish: [`${prefix}/*`],
        refreshAfterInSeconds: 60 * 15,
        disconnectAfterInSeconds: 60 * 60 * 24,
      }
    : {
        principalId: "rangingdashboardinvalid",
        subscribe: [],
        publish: [],
        refreshAfterInSeconds: 60 * 5,
        disconnectAfterInSeconds: 60 * 10,
      };
});
