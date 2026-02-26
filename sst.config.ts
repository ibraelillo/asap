/// <reference path="./.sst/platform/config.d.ts" />

const DEFAULT_SYMBOLS = [
  "DOTUSDTM",
  "SUIUSDTM",
  "SOLUSDTM",
  "ADAUSDTM",
  "LINKUSDTM",
  "TRUMPUSDTM",
  "XRPUSDTM",
  "ETHUSDTM",
  "BCHUSDTM",
  "LTCUSDTM",
  "AVAXUSDTM",
  "HYPEUSDTM",
  "FETUSDTM",
  "FILUSDTM",
];

const DEFAULT_BOTS = DEFAULT_SYMBOLS.map((symbol) => ({
  symbol,
  executionTimeframe: "15m",
  primaryRangeTimeframe: "1d",
  secondaryRangeTimeframe: "4h",
  executionLimit: 240,
  primaryRangeLimit: 90,
  secondaryRangeLimit: 180,
}));

function extractSymbolsFromBotsJson(botsJson: string): string[] {
  try {
    const parsed = JSON.parse(botsJson);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => (item && typeof item === "object" ? (item as { symbol?: unknown }).symbol : undefined))
      .filter((symbol): symbol is string => typeof symbol === "string" && symbol.length > 0);
  } catch {
    return [];
  }
}

export default $config({
  app(input) {
    return {
      name: "asap",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          profile: "perso",
        },
      },
    };
  },
  async run() {
    $transform(sst.aws.Function, (args) => {
      args.runtime = "nodejs22.x";
      args.architecture = "arm64";
      args.memory = "1024 MB";
    });

    const botsJson = process.env.RANGING_BOTS_JSON ?? JSON.stringify(DEFAULT_BOTS);
    const schedule = process.env.RANGING_SCHEDULE ?? "rate(1 minute)";
    const symbols = extractSymbolsFromBotsJson(botsJson);
    const realtimeToken = process.env.RANGING_REALTIME_TOKEN ?? "";
    const realtimeTopicPrefix = `${$app.name}/${$app.stage}/ranging-bot`;

    const kucoinApiKey = process.env.KUCOIN_API_KEY ?? "";
    const kucoinApiSecret = process.env.KUCOIN_API_SECRET ?? "";
    const kucoinApiPassphrase = process.env.KUCOIN_API_PASSPHRASE ?? "";

    const runsTable = new sst.aws.Dynamo("RangingBotRuns", {
      fields: {
        PK: "string",
        SK: "string",
        GSI1PK: "string",
        GSI1SK: "string",
      },
      primaryIndex: {
        hashKey: "PK",
        rangeKey: "SK",
      },
      globalIndexes: {
        BySymbol: {
          hashKey: "GSI1PK",
          rangeKey: "GSI1SK",
        },
      },
    });

    const realtime = new sst.aws.Realtime("RangingRealtime", {
      authorizer: {
        handler: "apps/ranging-bot/src/realtime-authorizer.handler",
        environment: {
          RANGING_REALTIME_TOKEN: realtimeToken,
          RANGING_REALTIME_TOPIC_PREFIX: realtimeTopicPrefix,
        },
      },
    });

    const api = new sst.aws.ApiGatewayV2("RangingBotApi", {
      link: [runsTable],
      cors: {
        allowMethods: ["GET", "OPTIONS"],
        allowOrigins: ["*"],
        allowHeaders: ["*"],
      },
    });

    const apiRouteEnv = {
      RANGING_BOT_RUNS_TABLE: runsTable.name,
      RANGING_BOTS_JSON: botsJson,
    };

    api.route("GET /v1/ranging/health", {
      handler: "apps/ranging-bot/src/results-api.healthHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/dashboard", {
      handler: "apps/ranging-bot/src/results-api.dashboardHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/runs", {
      handler: "apps/ranging-bot/src/results-api.runsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/bots", {
      handler: "apps/ranging-bot/src/results-api.botsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/trades/{id}", {
      handler: "apps/ranging-bot/src/results-api.tradeDetailsHandler",
      environment: apiRouteEnv,
    });

    const web = new sst.aws.StaticSite("Web", {
      path: "apps/web",
      environment: {
        VITE_RANGING_API_URL: api.url,
        VITE_RANGING_REALTIME_ENDPOINT: realtime.endpoint,
        VITE_RANGING_REALTIME_AUTHORIZER: realtime.authorizer,
        VITE_RANGING_REALTIME_TOKEN: realtimeToken,
        VITE_RANGING_REALTIME_TOPIC_PREFIX: realtimeTopicPrefix,
      },
      build: {
        command: "bun run build",
        output: "dist",
      },
      dev: {
        command: "bunx vite dev",
        directory: "apps/web",
        title: "web",
      },
    });

    new sst.aws.Cron("RangingBotTick", {
      schedule,
      function: {
        handler: "apps/ranging-bot/src/tick.handler",
        timeout: "55 seconds",
        link: [runsTable, realtime],
        environment: {
          KUCOIN_API_KEY: kucoinApiKey,
          KUCOIN_API_SECRET: kucoinApiSecret,
          KUCOIN_API_PASSPHRASE: kucoinApiPassphrase,
          RANGING_BOTS_JSON: botsJson,
          RANGING_DRY_RUN: process.env.RANGING_DRY_RUN ?? "true",
          RANGING_MARGIN_MODE: process.env.RANGING_MARGIN_MODE ?? "CROSS",
          RANGING_VALUE_QTY: process.env.RANGING_VALUE_QTY ?? "100",
          RANGING_BOT_RUNS_TABLE: runsTable.name,
          RANGING_REALTIME_ENDPOINT: realtime.endpoint,
          RANGING_REALTIME_TOPIC_PREFIX: realtimeTopicPrefix,
        },
      },
      event: {
        trigger: "ranging-bot-cron",
        symbols: JSON.stringify(symbols),
      },
    });

    let botCount = DEFAULT_BOTS.length;
    try {
      const parsed = JSON.parse(botsJson);
      if (Array.isArray(parsed)) {
        botCount = parsed.length;
      }
    } catch {
      // keep fallback value
    }

    return {
      mode: "ranging-bot-scheduler",
      schedule,
      botCount,
      dryRun: process.env.RANGING_DRY_RUN ?? "true",
      webUrl: web.url,
      apiUrl: api.url,
      realtimeEndpoint: realtime.endpoint,
      realtimeTopicPrefix,
    };
  },
});
