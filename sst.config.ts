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
  executionTimeframe: "1h",
  primaryRangeTimeframe: "1d",
  secondaryRangeTimeframe: "4h",
  executionLimit: 240,
  primaryRangeLimit: 90,
  secondaryRangeLimit: 180,
}));

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

    const botsJson =
      process.env.RANGING_BOTS_JSON ?? JSON.stringify(DEFAULT_BOTS);
    const schedule = process.env.RANGING_SCHEDULE ?? "cron(0 * * * ? *)";
    const reconciliationSchedule =
      process.env.RANGING_RECONCILIATION_SCHEDULE ?? "rate(5 minutes)";
    const symbolsRefreshSchedule =
      process.env.RANGING_SYMBOLS_REFRESH_SCHEDULE ?? "rate(1 day)";
    const realtimeToken = process.env.RANGING_REALTIME_TOKEN ?? "";
    const realtimeTopicPrefix = `${$app.name}/${$app.stage}/ranging-bot`;

    const kucoinApiKey = process.env.KUCOIN_API_KEY ?? "";
    const kucoinApiSecret = process.env.KUCOIN_API_SECRET ?? "";
    const kucoinApiPassphrase = process.env.KUCOIN_API_PASSPHRASE ?? "";
    const openAiApiKey = process.env.OPENAI_API_KEY ?? "";
    const validationModelPrimary =
      process.env.RANGING_VALIDATION_MODEL_PRIMARY ?? "gpt-5-nano-2025-08-07";
    const validationModelFallback =
      process.env.RANGING_VALIDATION_MODEL_FALLBACK ?? "gpt-5-mini-2025-08-07";
    const validationConfidenceThreshold =
      process.env.RANGING_VALIDATION_CONFIDENCE_THRESHOLD ?? "0.72";
    const validationMaxOutputTokens =
      process.env.RANGING_VALIDATION_MAX_OUTPUT_TOKENS ?? "800";
    const validationTimeoutMs =
      process.env.RANGING_VALIDATION_TIMEOUT_MS ?? "45000";
    const klineHttpTimeoutMs =
      process.env.RANGING_KLINE_HTTP_TIMEOUT_MS ?? "20000";
    const klineHttpRetries = process.env.RANGING_KLINE_HTTP_RETRIES ?? "3";
    const klineHttpBackoffMs =
      process.env.RANGING_KLINE_HTTP_BACKOFF_MS ?? "350";
    const backtestRunningStaleMs =
      process.env.RANGING_BACKTEST_RUNNING_STALE_MS ?? "1200000";

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

    const klineCacheBucket = new sst.aws.Bucket("RangingKlineCache", {
      access: "cloudfront",
      cors: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "HEAD"],
        allowHeaders: ["*"],
      },
    });
    const backtestBus = new sst.aws.Bus("RangingBacktestBus");

    const router = new sst.aws.Router("RangingRouter");
    router.routeBucket("/klines", klineCacheBucket, {
      rewrite: {
        regex: "^/klines/(.*)$",
        to: "/$1",
      },
    });
    router.routeBucket("/symbols", klineCacheBucket, {
      rewrite: {
        regex: "^/symbols/(.*)$",
        to: "/$1",
      },
    });

    const klinesBaseUrl = router.url.apply(
      (url) => `${url.replace(/\/+$/, "")}/klines`,
    );
    const symbolsBaseUrl = router.url.apply(
      (url) => `${url.replace(/\/+$/, "")}/symbols`,
    );

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
      link: [runsTable, klineCacheBucket, backtestBus],
      cors: {
        allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
        allowOrigins: ["*"],
        allowHeaders: ["*"],
      },
    });

    const apiRouteEnv = {
      RANGING_BOT_RUNS_TABLE: runsTable.name,
      RANGING_BOTS_JSON: botsJson,
      RANGING_KLINES_BUCKET: klineCacheBucket.name,
      RANGING_KLINES_PUBLIC_BASE_URL: klinesBaseUrl,
      RANGING_SYMBOLS_PUBLIC_BASE_URL: symbolsBaseUrl,
      RANGING_BACKTEST_BUS_NAME: backtestBus.name,
      RANGING_VALIDATION_MODEL_PRIMARY: validationModelPrimary,
      RANGING_VALIDATION_MODEL_FALLBACK: validationModelFallback,
      RANGING_VALIDATION_CONFIDENCE_THRESHOLD: validationConfidenceThreshold,
      RANGING_BACKTEST_RUNNING_STALE_MS: backtestRunningStaleMs,
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
    api.route("GET /v1/bots", {
      handler: "apps/ranging-bot/src/results-api.botsHandler",
      environment: apiRouteEnv,
    });
    api.route("POST /v1/bots", {
      handler: "apps/ranging-bot/src/results-api.createBotHandler",
      environment: apiRouteEnv,
    });
    api.route("PATCH /v1/bots/{botId}", {
      handler: "apps/ranging-bot/src/results-api.patchBotHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/accounts", {
      handler: "apps/ranging-bot/src/results-api.accountsHandler",
      environment: apiRouteEnv,
    });
    api.route("POST /v1/accounts", {
      handler: "apps/ranging-bot/src/results-api.createAccountHandler",
      environment: apiRouteEnv,
    });
    api.route("PATCH /v1/accounts/{accountId}", {
      handler: "apps/ranging-bot/src/results-api.patchAccountHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/accounts/{accountId}/symbols", {
      handler: "apps/ranging-bot/src/results-api.accountSymbolsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/exchanges/{exchangeId}/symbols", {
      handler: "apps/ranging-bot/src/results-api.exchangeSymbolsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/strategies", {
      handler: "apps/ranging-bot/src/results-api.strategiesHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/strategies/{strategyId}", {
      handler: "apps/ranging-bot/src/results-api.strategyDetailsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/bots/stats", {
      handler: "apps/ranging-bot/src/results-api.botStatsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/bots/{botId}", {
      handler: "apps/ranging-bot/src/results-api.botDetailsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/bots/{botId}/runs", {
      handler: "apps/ranging-bot/src/results-api.botRunsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/bots/{botId}/stats", {
      handler: "apps/ranging-bot/src/results-api.botDetailsStatsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/bots/{botId}/positions", {
      handler: "apps/ranging-bot/src/results-api.botPositionsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/backtests", {
      handler: "apps/ranging-bot/src/results-api.backtestsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/bots/{botId}/backtests", {
      handler: "apps/ranging-bot/src/results-api.botBacktestsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/backtests/{id}", {
      handler: "apps/ranging-bot/src/results-api.backtestDetailsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/backtests/{id}", {
      handler: "apps/ranging-bot/src/results-api.backtestDetailsHandler",
      environment: apiRouteEnv,
    });
    api.route("POST /v1/ranging/backtests", {
      handler: "apps/ranging-bot/src/results-api.createBacktestHandler",
      environment: apiRouteEnv,
    });
    api.route("POST /v1/bots/{botId}/backtests", {
      handler: "apps/ranging-bot/src/results-api.createBotBacktestHandler",
      environment: apiRouteEnv,
    });
    api.route("POST /v1/ranging/validations", {
      handler: "apps/ranging-bot/src/results-api.createRangeValidationHandler",
      environment: apiRouteEnv,
    });
    api.route("POST /v1/bots/{botId}/validations", {
      handler:
        "apps/ranging-bot/src/results-api.createBotRangeValidationHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/validations", {
      handler: "apps/ranging-bot/src/results-api.rangeValidationsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/bots/{botId}/validations", {
      handler: "apps/ranging-bot/src/results-api.botRangeValidationsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/validations/{id}", {
      handler: "apps/ranging-bot/src/results-api.rangeValidationDetailsHandler",
      environment: apiRouteEnv,
    });
    api.route("GET /v1/ranging/trades/{id}", {
      handler: "apps/ranging-bot/src/results-api.tradeDetailsHandler",
      environment: apiRouteEnv,
    });

    backtestBus.subscribe(
      "BacktestWorker",
      {
        handler: "apps/ranging-bot/src/backtest-worker.handler",
        timeout: "15 minutes",
        link: [runsTable, klineCacheBucket],
        environment: {
          RANGING_BOT_RUNS_TABLE: runsTable.name,
          RANGING_KLINES_BUCKET: klineCacheBucket.name,
          RANGING_KLINES_PUBLIC_BASE_URL: klinesBaseUrl,
          OPENAI_API_KEY: openAiApiKey,
          RANGING_VALIDATION_MODEL_PRIMARY: validationModelPrimary,
          RANGING_VALIDATION_MODEL_FALLBACK: validationModelFallback,
          RANGING_VALIDATION_CONFIDENCE_THRESHOLD:
            validationConfidenceThreshold,
          RANGING_VALIDATION_MAX_OUTPUT_TOKENS: validationMaxOutputTokens,
          RANGING_VALIDATION_TIMEOUT_MS: validationTimeoutMs,
          RANGING_KLINE_HTTP_TIMEOUT_MS: klineHttpTimeoutMs,
          RANGING_KLINE_HTTP_RETRIES: klineHttpRetries,
          RANGING_KLINE_HTTP_BACKOFF_MS: klineHttpBackoffMs,
        },
      },
      {
        pattern: {
          source: ["asap.ranging.backtest"],
          detailType: ["backtest.requested"],
        },
      },
    );

    backtestBus.subscribe(
      "RangeValidationWorker",
      {
        handler: "apps/ranging-bot/src/validation-worker.handler",
        timeout: "2 minutes",
        link: [runsTable],
        environment: {
          RANGING_BOT_RUNS_TABLE: runsTable.name,
          OPENAI_API_KEY: openAiApiKey,
          RANGING_VALIDATION_MODEL_PRIMARY: validationModelPrimary,
          RANGING_VALIDATION_MODEL_FALLBACK: validationModelFallback,
          RANGING_VALIDATION_CONFIDENCE_THRESHOLD:
            validationConfidenceThreshold,
          RANGING_VALIDATION_MAX_OUTPUT_TOKENS: validationMaxOutputTokens,
          RANGING_VALIDATION_TIMEOUT_MS: validationTimeoutMs,
        },
      },
      {
        pattern: {
          source: ["asap.ranging.validation"],
          detailType: ["range.validation.requested"],
        },
      },
    );

    const web = new sst.aws.StaticSite("Web", {
      path: "apps/web",
      router: {
        instance: router,
      },
      environment: {
        VITE_RANGING_API_URL: api.url,
        VITE_RANGING_REALTIME_ENDPOINT: realtime.endpoint,
        VITE_RANGING_REALTIME_AUTHORIZER: realtime.authorizer,
        VITE_RANGING_REALTIME_TOKEN: realtimeToken,
        VITE_RANGING_REALTIME_TOPIC_PREFIX: realtimeTopicPrefix,
        VITE_RANGING_KLINES_BASE_URL: klinesBaseUrl,
        VITE_RANGING_SYMBOLS_BASE_URL: symbolsBaseUrl,
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
      },
    });

    new sst.aws.Cron("RangingBotReconciliation", {
      schedule: reconciliationSchedule,
      function: {
        handler: "apps/ranging-bot/src/reconciliation-worker.handler",
        timeout: "55 seconds",
        link: [runsTable],
        environment: {
          KUCOIN_API_KEY: kucoinApiKey,
          KUCOIN_API_SECRET: kucoinApiSecret,
          KUCOIN_API_PASSPHRASE: kucoinApiPassphrase,
          RANGING_BOTS_JSON: botsJson,
          RANGING_BOT_RUNS_TABLE: runsTable.name,
        },
      },
      event: {
        trigger: "ranging-bot-reconciliation-cron",
      },
    });

    new sst.aws.Cron("RangingSymbolCatalogRefresh", {
      schedule: symbolsRefreshSchedule,
      function: {
        handler: "apps/ranging-bot/src/symbol-catalog-worker.handler",
        timeout: "2 minutes",
        link: [runsTable, klineCacheBucket],
        environment: {
          RANGING_BOT_RUNS_TABLE: runsTable.name,
          RANGING_KLINES_BUCKET: klineCacheBucket.name,
          RANGING_SYMBOLS_PUBLIC_BASE_URL: symbolsBaseUrl,
        },
      },
      event: {
        trigger: "ranging-symbol-catalog-refresh",
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
      reconciliationSchedule,
      symbolsRefreshSchedule,
      botCount,
      dryRun: process.env.RANGING_DRY_RUN ?? "true",
      webUrl: web.url,
      apiUrl: api.url,
      routerUrl: router.url,
      realtimeEndpoint: realtime.endpoint,
      realtimeTopicPrefix,
      klineCacheBucket: klineCacheBucket.name,
      klinesBaseUrl,
      symbolsBaseUrl,
      backtestBusName: backtestBus.name,
    };
  },
});
