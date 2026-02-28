/// <reference path="./.sst/platform/config.d.ts" />

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
    const runtimeConfig = new sst.Linkable("RangingRuntimeConfig", {
      properties: {
        openAiResponsesEndpoint:
          process.env.OPENAI_RESPONSES_ENDPOINT ??
          "https://api.openai.com/v1/responses",
        kucoinPublicBaseUrl:
          process.env.KUCOIN_PUBLIC_BASE_URL ??
          "https://api-futures.kucoin.com",
        validationModelPrimary,
        validationModelFallback,
        validationConfidenceThreshold,
        validationMaxOutputTokens,
        validationTimeoutMs,
        klineHttpTimeoutMs,
        klineHttpRetries,
        klineHttpBackoffMs,
        backtestRunningStaleMs,
        defaultDryRun: process.env.RANGING_DRY_RUN ?? "true",
        defaultMarginMode: process.env.RANGING_MARGIN_MODE ?? "CROSS",
        defaultValueQty: process.env.RANGING_VALUE_QTY ?? "100",
        klinesPublicBaseUrl: klinesBaseUrl,
        symbolsPublicBaseUrl: symbolsBaseUrl,
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
      link: [runsTable, klineCacheBucket, backtestBus, runtimeConfig],
      cors: {
        allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
        allowOrigins: ["*"],
        allowHeaders: ["*"],
      },
    });

    api.route("GET /v1/ranging/health", {
      handler: "apps/ranging-bot/src/results-api.healthHandler",
    });
    api.route("GET /v1/ranging/dashboard", {
      handler: "apps/ranging-bot/src/results-api.dashboardHandler",
    });
    api.route("GET /v1/ranging/runs", {
      handler: "apps/ranging-bot/src/results-api.runsHandler",
    });
    api.route("GET /v1/ranging/bots", {
      handler: "apps/ranging-bot/src/results-api.botsHandler",
    });
    api.route("GET /v1/bots", {
      handler: "apps/ranging-bot/src/results-api.botsHandler",
    });
    api.route("POST /v1/bots", {
      handler: "apps/ranging-bot/src/results-api.createBotHandler",
    });
    api.route("PATCH /v1/bots/{botId}", {
      handler: "apps/ranging-bot/src/results-api.patchBotHandler",
    });
    api.route("GET /v1/accounts", {
      handler: "apps/ranging-bot/src/results-api.accountsHandler",
    });
    api.route("POST /v1/accounts", {
      handler: "apps/ranging-bot/src/results-api.createAccountHandler",
    });
    api.route("PATCH /v1/accounts/{accountId}", {
      handler: "apps/ranging-bot/src/results-api.patchAccountHandler",
    });
    api.route("GET /v1/accounts/{accountId}/symbols", {
      handler: "apps/ranging-bot/src/results-api.accountSymbolsHandler",
    });
    api.route("GET /v1/exchanges/{exchangeId}/symbols", {
      handler: "apps/ranging-bot/src/results-api.exchangeSymbolsHandler",
    });
    api.route("GET /v1/strategies", {
      handler: "apps/ranging-bot/src/results-api.strategiesHandler",
    });
    api.route("GET /v1/strategies/{strategyId}", {
      handler: "apps/ranging-bot/src/results-api.strategyDetailsHandler",
    });
    api.route("GET /v1/ranging/bots/stats", {
      handler: "apps/ranging-bot/src/results-api.botStatsHandler",
    });
    api.route("GET /v1/bots/{botId}", {
      handler: "apps/ranging-bot/src/results-api.botDetailsHandler",
    });
    api.route("GET /v1/bots/{botId}/runs", {
      handler: "apps/ranging-bot/src/results-api.botRunsHandler",
    });
    api.route("GET /v1/bots/{botId}/stats", {
      handler: "apps/ranging-bot/src/results-api.botDetailsStatsHandler",
    });
    api.route("GET /v1/bots/{botId}/positions", {
      handler: "apps/ranging-bot/src/results-api.botPositionsHandler",
    });
    api.route("GET /v1/ranging/backtests", {
      handler: "apps/ranging-bot/src/results-api.backtestsHandler",
    });
    api.route("GET /v1/bots/{botId}/backtests", {
      handler: "apps/ranging-bot/src/results-api.botBacktestsHandler",
    });
    api.route("GET /v1/ranging/backtests/{id}", {
      handler: "apps/ranging-bot/src/results-api.backtestDetailsHandler",
    });
    api.route("GET /v1/backtests/{id}", {
      handler: "apps/ranging-bot/src/results-api.backtestDetailsHandler",
    });
    api.route("POST /v1/ranging/backtests", {
      handler: "apps/ranging-bot/src/results-api.createBacktestHandler",
    });
    api.route("POST /v1/bots/{botId}/backtests", {
      handler: "apps/ranging-bot/src/results-api.createBotBacktestHandler",
    });
    api.route("POST /v1/ranging/validations", {
      handler: "apps/ranging-bot/src/results-api.createRangeValidationHandler",
    });
    api.route("POST /v1/bots/{botId}/validations", {
      handler:
        "apps/ranging-bot/src/results-api.createBotRangeValidationHandler",
    });
    api.route("GET /v1/ranging/validations", {
      handler: "apps/ranging-bot/src/results-api.rangeValidationsHandler",
    });
    api.route("GET /v1/bots/{botId}/validations", {
      handler: "apps/ranging-bot/src/results-api.botRangeValidationsHandler",
    });
    api.route("GET /v1/ranging/validations/{id}", {
      handler: "apps/ranging-bot/src/results-api.rangeValidationDetailsHandler",
    });
    api.route("GET /v1/ranging/trades/{id}", {
      handler: "apps/ranging-bot/src/results-api.tradeDetailsHandler",
    });

    backtestBus.subscribe(
      "BacktestWorker",
      {
        handler: "apps/ranging-bot/src/backtest-worker.handler",
        timeout: "15 minutes",
        link: [runsTable, klineCacheBucket, runtimeConfig],
        environment: {
          OPENAI_API_KEY: openAiApiKey,
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
        link: [runsTable, runtimeConfig],
        environment: {
          OPENAI_API_KEY: openAiApiKey,
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
        link: [runsTable, realtime, runtimeConfig],
        environment: {
          KUCOIN_API_KEY: kucoinApiKey,
          KUCOIN_API_SECRET: kucoinApiSecret,
          KUCOIN_API_PASSPHRASE: kucoinApiPassphrase,
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
        link: [runsTable, runtimeConfig],
        environment: {
          KUCOIN_API_KEY: kucoinApiKey,
          KUCOIN_API_SECRET: kucoinApiSecret,
          KUCOIN_API_PASSPHRASE: kucoinApiPassphrase,
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
        link: [runsTable, klineCacheBucket, runtimeConfig],
      },
      event: {
        trigger: "ranging-symbol-catalog-refresh",
      },
    });

    return {
      mode: "ranging-bot-scheduler",
      schedule,
      reconciliationSchedule,
      symbolsRefreshSchedule,
      botCount: "stored",
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
