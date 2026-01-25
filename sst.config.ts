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
    /**
     * Global Lambda Function Configuration
     *
     * This transform applies default settings to ALL Lambda functions in the stack
     * Benefits:
     * - Consistency: All functions use the same runtime and architecture
     * - Performance: ARM64 is faster and cheaper than x86
     * - Cost optimization: ARM64 provides 20% better price-performance
     * - Modern runtime: Node.js 22.x has latest features and security patches
     */
    $transform(sst.aws.Function, (args) => {
      // Runtime: Node.js 22.x (latest LTS version)
      // Provides ES modules, top-level await, and improved performance
      args.runtime = "nodejs22.x";

      // Architecture: ARM64 (Graviton2 processors)
      // 20% better price-performance compared to x86_64
      // Fully compatible with Node.js and most npm packages
      args.architecture = "arm64";

      // Memory: 1024 MB (1 GB)
      // Higher memory = more CPU power for faster execution
      // Good balance between cost and performance for trading operations
      args.memory = "1024 MB";
    });

    /**
     * KuCoin API Configuration
     *
     * Linkable resource that stores KuCoin API credentials
     * These credentials are automatically injected into linked resources (Lambdas, Fargate)
     *
     * Security Note: In production, use AWS Secrets Manager or SSM Parameter Store
     * Example: const apiKey = new sst.Secret("KucoinApiKey")
     *
     * Linked to:
     * - Orchestrator service (Fargate)
     * - Order Lambda function
     * - Position Lambda function
     */
    const config = new sst.Linkable("Kucoin", {
      properties: {
        // API Key for KuCoin Futures trading
        apiKey: "67cbafebdf512e0001bbea87",

        // API Secret for signing requests
        apiSecret: "4bb0677f-62a9-4263-b837-b445f317dee7",

        // Passphrase for additional security
        passphrase: "Ricolino01!!",
      },
    });

    /**
     * EventBridge bus for routing trading events
     *
     * Event types:
     * - bot.config.changed: Bot configuration updated in DynamoDB
     * - market.position.changed: Position update from KuCoin WebSocket
     * - market.position.closed: Position closed from KuCoin WebSocket
     * - market.order.filled: Order filled from KuCoin WebSocket
     * - market.ticker.updated: Price update from KuCoin WebSocket
     */
    const bus = new sst.aws.Bus("TradingEvents");

    /**
     * DynamoDB table for storing bot configurations and state
     *
     * Schema design:
     * - PK (Partition Key): Identifies the entity type and unique identifier
     * - SK (Sort Key): Allows multiple items per entity (config, state, orders)
     *
     * Example items:
     * 1. Bot Config: PK="BOT#SUIUSDTM#LONG", SK="CONFIG"
     * 2. Bot State: PK="BOT#SUIUSDTM#LONG", SK="STATE"
     * 3. Order: PK="ORDER#abc123", SK="STATUS"
     *
     * Access patterns:
     * 1. Get bot config: Query by PK=BOT#{symbol}#{side}, SK=CONFIG
     * 2. Get all bots for symbol: Query GSI1 where GSI1PK={symbol}
     * 3. Get all enabled bots: Query GSI2 where GSI2PK="true"
     */
    const table = new sst.aws.Dynamo("Bots", {
      fields: {
        id: "string",
        symbol: "string"
      },
      primaryIndex: {
        hashKey: "id",
        rangeKey: "symbol"
      },

      // Enable DynamoDB Streams to capture all changes
      // This allows EventBridge to react to config changes
      stream: "new-and-old-images",
    });

    const { EventBridgePipe } = await import("./iac/pipe");

    /**
     * EventBridge Pipe: DynamoDB Streams → EventBridge Bus
     *
     * Purpose: Automatically publish DynamoDB changes to EventBridge
     *
     * Flow:
     * 1. Bot config changes in DynamoDB (INSERT/MODIFY/REMOVE)
     * 2. DynamoDB Stream captures the change
     * 3. EventBridge Pipe transforms stream record to event
     * 4. Event published to EventBridge Bus
     * 5. Lambda functions react to the event
     *
     * Filter: Only process CONFIG items (SK="CONFIG")
     * This prevents noise from STATE and ORDER updates
     */
    const pipe = new EventBridgePipe({
      name: "ConfigChangePipe",

      // Source: DynamoDB Stream from Bots table
      sourceArn: table.nodes.table.streamArn,

      // Target: EventBridge Bus for routing to Lambdas
      targetArn: bus.arn,

      // Filter: Only process CONFIG items (SK="CONFIG")
      // This prevents processing STATE and ORDER updates
      filterPattern: JSON.stringify({
        dynamodb: {
          Keys: {
            SK: {
              S: ["CONFIG"],
            },
          },
        },
      }),
    });

    /**
     * VPC (Virtual Private Cloud)
     *
     * Isolated network for running the orchestrator service
     *
     * Configuration:
     * - az: 2 availability zones for high availability
     * - nat: EC2-based NAT gateway for outbound internet access
     *   (Required for KuCoin API and AWS service calls)
     *
     * Cost: ~$30-40/month for NAT gateway
     * Alternative: Use 'managed' for AWS NAT Gateway (more expensive but managed)
     */
    const vpc = new sst.aws.Vpc("TradingVpc", {
      // Deploy across 2 availability zones for fault tolerance
      az: 2,

      // Use EC2 instance as NAT gateway (cost-effective)
      nat: "ec2",
    });

    /**
     * ECS Cluster
     *
     * Container orchestration cluster for running the WebSocket orchestrator
     *
     * Configuration:
     * - vpc: Runs in the Trading VPC
     * - forceUpgrade: Use ECS v2 for better performance
     */
    const cluster = new sst.aws.Cluster("TradingCluster", {
      // VPC where the cluster runs
      vpc,

      // Force upgrade to ECS v2 for improved features
      forceUpgrade: "v2",
    });

    /**
     * Fargate Service: WebSocket Orchestrator
     *
     * Long-running container that maintains persistent WebSocket connections to KuCoin
     *
     * Responsibilities:
     * 1. Connect to KuCoin WebSocket API (private + public channels)
     * 2. Subscribe to position, order, and ticker updates
     * 3. Forward all events to EventBridge for Lambda processing
     * 4. Load enabled symbols from DynamoDB on startup
     *
     * Architecture:
     * - Runs 24/7 in Fargate (serverless containers)
     * - Auto-restarts on failure
     * - Scales to 1 task (no auto-scaling needed for WebSocket)
     *
     * Cost: ~$20-30/month for 1 task with 0.5 vCPU and 1GB memory
     */
    const service = new sst.aws.Service("Orquestrator", {
      // ECS cluster where the service runs
      cluster,

      // ARM64 architecture for cost savings (20% cheaper than x86)
      architecture: "arm64",

      // Linked resources: Automatically injects environment variables
      // - table: DynamoDB table name for reading bot configs
      // - config: KuCoin API credentials
      // - bus: EventBridge bus name for publishing events
      link: [table, config, bus],

      capacity: $app.stage === "production" ? undefined : "spot",

      // Docker image configuration
      image: {
        // Build context: orchestrator app directory
        context: "./apps/orquestrator",

        // Dockerfile path relative to context
        dockerfile: "Dockerfile",
      },

      serviceRegistry: {
        port: 80,
      },

      loadBalancer: {
        public: false,
        ports: [{ listen: "80/http", forward: "3000/http" }],
      },

      dev: {
        autostart: true,
        command: "pnpm run dev",
        url: "http://localhost:3000/",
      },
    });

    /**
     * Subscribe Orchestrator to EventBridge
     *
     * Allows orchestrator to receive events via HTTP endpoint
     * Useful for monitoring and debugging
     */
    const orquestratorBridge = new sst.aws.Function("OrquestratorBridge", {
      handler: "apps/bots/bridge.handler",
      link: [service],
    });

    /**
     * EventBridge Subscription: Bridge to Orchestrator
     *
     * Routes specific events from EventBridge to Fargate orchestrator via Lambda bridge
     *
     * Event types forwarded:
     * - DynamoDBEvent: Bot configuration changes from DynamoDB Stream
     * - orchestrator.*: System events (startup, shutdown, health)
     */
    bus.subscribe("Orchestrator", orquestratorBridge.arn, {
      pattern: {
        detailType: ["*"],
      },
    });

    const {
      PositionChanged,
      PositionClosed,
      OrderChanged,
      OrquestratorStarted,
    } = await import("@repo/events");

    /**
     * Lambda Function: Order Handler
     *
     * Purpose: Process order-related events from KuCoin WebSocket
     *
     * Triggered by: EventBridge events with type "market.order.filled"
     *
     * Responsibilities:
     * 1. Receive order fill notifications from WebSocket Manager
     * 2. Update order status in DynamoDB
     * 3. Track order execution for analytics
     * 4. Handle order errors and retries
     *
     * Linked resources:
     * - table: DynamoDB table for reading bot config and updating order state
     * - bus: EventBridge bus for publishing order completion events
     */
    const orderFn = new sst.aws.Function("Orders", {
      // Function name includes app name and stage for easy identification
      name: `Orders-${$app.name}-${$app.stage}`,

      // Handler path: apps/trading-bot/src/orderFn.ts exports a "handler" function
      handler: "apps/bots/orderFn.handler",

      // Link resources: Automatically injects environment variables for table and bus
      // This allows the function to access DynamoDB and EventBridge without hardcoding ARNs
      link: [table, bus, config],
    });

    /**
     * Lambda Function: Position Handler
     *
     * Purpose: Process position-related events from KuCoin WebSocket
     *
     * Triggered by: EventBridge events with types:
     * - "market.position.changed": Position updated (size, PnL, etc.)
     * - "market.position.closed": Position fully closed
     *
     * Responsibilities:
     * 1. Receive position updates from WebSocket Manager
     * 2. Read bot configuration from DynamoDB
     * 3. Execute trading logic:
     *    - If position changed: Place take profit and security orders
     *    - If position closed: Open new position
     * 4. Update bot state in DynamoDB
     * 5. Place orders via KuCoin REST API
     *
     * Linked resources:
     * - table: DynamoDB table for reading bot config and updating position state
     * - bus: EventBridge bus for publishing position events to other functions
     */
    const positionChanged = new sst.aws.Function("PositionChanged", {
      // Function name includes app name and stage for easy identification
      name: `PositionChanged-${$app.name}-${$app.stage}`,

      // Handler path: apps/trading-bot/src/positionFn.ts exports a "handler" function
      handler: "apps/bots/positionFn.onPositionChanged",

      // Link resources: Automatically injects environment variables for table and bus
      // This allows the function to access DynamoDB and EventBridge without hardcoding ARNs
      link: [table, bus, config],
    });

    const positionClosed = new sst.aws.Function("PositionClosed", {
      // Function name includes app name and stage for easy identification
      name: `PositionClosed-${$app.name}-${$app.stage}`,

      // Handler path: apps/trading-bot/src/positionFn.ts exports a "handler" function
      handler: "apps/bots/positionFn.onPositionClosed",

      // Link resources: Automatically injects environment variables for table and bus
      // This allows the function to access DynamoDB and EventBridge without hardcoding ARNs
      link: [table, bus, config],
    });

    const orquestratorStarted = new sst.aws.Function("OrquestratorStarted", {
      // Function name includes app name and stage for easy identification
      name: `OrquestratorStarted-${$app.name}-${$app.stage}`,

      // Handler path: apps/trading-bot/src/positionFn.ts exports a "handler" function
      handler: "apps/bots/positionFn.orquestratorStarted",

      // Link resources: Automatically injects environment variables for table and bus
      // This allows the function to access DynamoDB and EventBridge without hardcoding ARNs
      link: [table, bus, config],
    });

    /**
     * EventBridge Subscription: Order Handler
     *
     * Routes order-related events to Order Lambda function
     *
     * Event types:
     * - orderChange: Order status changes from KuCoin WebSocket
     * - orchestrator.started: Orchestrator startup notification
     */
    bus.subscribe("Orders", orderFn.arn, {
      pattern: {
        detailType: ["orderChange", "orchestrator.started"],
      },
    });

    /**
     * EventBridge Subscription: Position Handler
     *
     * Routes position-related events to Position Lambda function
     *
     * Event types:
     * - position.change: Position size/PnL changes from KuCoin WebSocket
     * - position.closed: Position fully closed from KuCoin WebSocket
     * - orchestrator.started: Orchestrator startup notification
     */
    bus.subscribe("PositionChanged", positionChanged.arn, {
      pattern: {
        detailType: [PositionChanged.type],
      },
    });

    bus.subscribe("PositionClosed", positionClosed.arn, {
      pattern: {
        detailType: [PositionClosed.type],
      },
    });

    bus.subscribe("OrquestratorStarted", orquestratorStarted.arn, {
      pattern: {
        detailType: [OrquestratorStarted.type],
      },
    });

    /**
     * API Lambda Function
     *
     * REST API for bot management using Hono framework
     * Provides CRUD operations for bot configurations
     */
    const api = new sst.aws.Function("Api", {
      handler: "apps/bots/api.handler",
      link: [table],
      url: true,
    });

    const site = new sst.aws.StaticSite("Site", {
      path: "apps/web",
      build: {
        command: "pnpm run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: api.url,
      },
    });

    return {
      site: site.url,
      api: api.url,
      bus: bus.name,
      table: table.name,
      pipeArn: pipe.pipe.arn,
      orchestratorUrl: service.url,
    };
  },
});
