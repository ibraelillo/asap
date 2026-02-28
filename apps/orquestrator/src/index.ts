import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import express from "express";
import type { Futures } from "kucoin-universal-sdk";
//import { Resource } from "sst";
import { config, fWs, start, stop } from "./client";

import { BotEngine } from "@repo/bot-config";
import { createKucoinClient, createKucoinService } from "@repo/kucoin";

console.log(config);

const service = createKucoinService(createKucoinClient(config.kucoin));

const engine = new BotEngine(/*Resource.Bots.name*/ "test", service);

/**
 * WebSocket Orchestrator
 *
 * Purpose: Maintain persistent WebSocket connections to KuCoin and forward ALL events to EventBridge
 *
 * Simplified Architecture:
 * 1. Connects to KuCoin WebSocket API (private channel only)
 * 2. Subscribes to ALL positions and ALL orders (2 global subscriptions)
 * 3. Forwards every event to EventBridge for Lambda processing
 * 4. No symbol filtering - Lambdas handle filtering based on their bot configs
 *
 * Benefits:
 * - Minimal subscriptions (only 2 WebSocket channels)
 * - No need to load bot configs or track symbols
 * - Automatic support for new bots without orchestrator restart
 * - Simpler code and easier maintenance
 *
 * This is a long-running process designed to run in AWS Fargate
 */
export class WebSocketOrchestrator {
  /**
   * EventBridge client for publishing events
   */
  private eventBridge: EventBridgeClient;

  /**
   * EventBridge bus name (from environment variable)
   */
  private eventBusName: string;

  /**
   * Subscription IDs for cleanup
   */
  private positionSubId: string | null = null;
  private orderSubId: string | null = null;

  /**
   * HTTP server for receiving EventBridge events
   */
  private httpServer: any = null;

  constructor() {
    // Initialize AWS clients
    this.eventBridge = new EventBridgeClient({});

    // Read configuration from environment variables (injected by SST)
    //this.eventBusName = process.env.EVENT_BUS_NAME || Resource.TradingEvents.name;

    //if (!this.eventBusName) {
    //  throw new Error("EVENT_BUS_NAME environment variable is required");
    //}
  }

  /**
   * Start the orchestrator
   *
   * 1. Start HTTP server for EventBridge events
   * 2. Start WebSocket connections
   * 3. Subscribe to ALL positions and ALL orders (2 subscriptions total)
   * 4. Notify all bots to start
   * 5. Forward all events to EventBridge
   * 6. Keep running indefinitely
   */
  async start(): Promise<void> {
    console.log("[Orchestrator] Starting WebSocket Orchestrator...");

    // Start HTTP server for EventBridge events
    //await this.startHttpServer();

    // Start KuCoin WebSocket connections
    console.log("[Orchestrator] Connecting to KuCoin WebSocket API...");
    await start();
    console.log("[Orchestrator] WebSocket connections established");

    // Subscribe to all positions and orders (only 2 subscriptions)
    await Promise.all([
      this.subscribeToAllPositions(),
      this.subscribeToAllOrders(),
    ]);

    // Notify all bots that orchestrator is ready
    await this.notifyBotsStartup();

    console.log("[Orchestrator] WebSocket Orchestrator is running");
    /*console.log(
          "[Orchestrator] Forwarding ALL events to EventBridge:",
          this.eventBusName
        );*/
  }

  /**
   * Stop the orchestrator
   *
   * Gracefully unsubscribes from all channels and closes connections
   */
  async stop(): Promise<void> {
    console.log("[Orchestrator] Stopping WebSocket Orchestrator...");

    // Close HTTP server
    if (this.httpServer) {
      console.log("[Orchestrator] Closing HTTP server...");
      await new Promise((resolve) => this.httpServer.close(resolve));
      this.httpServer = null;
    }

    // Unsubscribe from channels
    console.log("[Orchestrator] Unsubscribing from all channels...");
    if (this.positionSubId) {
      await fWs.unSubscribe(this.positionSubId);
      this.positionSubId = null;
    }
    if (this.orderSubId) {
      await fWs.unSubscribe(this.orderSubId);
      this.orderSubId = null;
    }

    // Close WebSocket connections
    console.log("[Orchestrator] Closing WebSocket connections...");
    await stop();

    console.log("[Orchestrator] WebSocket Orchestrator stopped");
  }

  /**
   * Subscribe to ALL position updates
   *
   * Forwards all position events to EventBridge
   * Lambdas will filter by symbol based on their bot configs
   */
  private async subscribeToAllPositions(): Promise<void> {
    console.log("[Orchestrator] Subscribing to all positions...");

    this.positionSubId = await fWs.allPosition(
      async (
        topic: string,
        subject: string,
        data: Futures.FuturesPrivate.AllPositionEvent,
      ) => {
        console.log(topic, subject, data.symbol, data.avgEntryPrice);

        if (!data.isOpen) {
          //const d = await PositionClosed.create(data);
          //await bus.publish(Resource.TradingEvents.name, PositionClosed, data);
          await engine.onPositionClosed(data);
        } else {
          //const d = await PositionChanged.create(data);
          await engine.onPositionChanged(data);
          //await bus.publish(Resource.TradingEvents.name, PositionChanged, data);
        }
        // Forward every position event to EventBridge
      },
    );

    console.log("[Orchestrator] Subscribed to all positions");
  }

  /**
   * Subscribe to ALL order updates
   *
   * Forwards all order events to EventBridge
   * Lambdas will filter by symbol based on their bot configs
   */
  private async subscribeToAllOrders(): Promise<void> {
    console.log("[Orchestrator] Subscribing to all orders...");

    /*this.orderSubId = await fWs.allOrder(
          async (
            topic: string,
            subject: string,
            data: Futures.FuturesPrivate.AllOrderEvent,
          ) => {
            // console.log(topic, subject, data);
            // Forward every order event to EventBridge
            //await bus.publish(Resource.TradingEvents.name, OrderChanged, data);
            await engine.run(data.symbol, OrderChanged.type, {
                symbol: data.symbol,
                //positionSide: data.
                ...data
            })
          },
        );*/

    console.log("[Orchestrator] Subscribed to all orders");
  }

  /**
   * Notify all bots to start
   *
   * Sends a startup event to EventBridge that all bot Lambdas can listen to
   * This allows bots to initialize their state when the orchestrator starts
   */
  private async notifyBotsStartup(): Promise<void> {
    console.log("[Orchestrator] Notifying all bots to start...");

    const symbols = [
      //"DOTUSDTM",
      //"ENAUSDTM",
      "SUIUSDTM",
      "SOLUSDTM",
      //"ADAUSDTM",
      "LINKUSDTM",
      //"BNBUSDTM",
      //"ATOMUSDTM",
      "TRUMPUSDTM",
      "XRPUSDTM",
      "ETHUSDTM",
      "BCHUSDTM",
      "LTCUSDTM",
      "AVAXUSDTM",
      //"DOGEUSDTM",
      "HYPEUSDTM",
      "FETUSDTM",
      "FILUSDTM",
    ];

    /*await bus.publish(Resource.TradingEvents.name, OrquestratorStarted, {
          ts: Date.now(),
          symbols
        });
         */

    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        //await engine.createBot(symbol, "LONG");

        await engine.createBot(symbol, "SHORT");
      }),
    );

    await engine.start();

    console.log("[Orchestrator] Bot startup notification sent");
  }

  /**
   * Start HTTP server to receive EventBridge events
   *
   * Listens on port 3000 for POST requests to /events
   * Events are forwarded from EventBridge via the bridge Lambda
   */
  private async startHttpServer(): Promise<void> {
    const app = express();
    /*app.use(express.json());

        // Health check endpoint
        app.get("/health", (req, res) => {
          res.json({
            status: "healthy",
            websocket: {
              positions: this.positionSubId !== null,
              orders: this.orderSubId !== null,
            },
            timestamp: Date.now(),
          });
        });

        // EventBridge events endpoint
        app.post("/events", async (req, res) => {
          try {
            const event = req.body;
            console.log("[HTTP] Received event from EventBridge:", {
              source: event.source,
              detailType: event["detail-type"],
              time: event.time,
            });

            // Process event (e.g., bot config changes from DynamoDB)
            // For now, just log it
            console.log("[HTTP] Event detail:", event.detail);

            // TODO throw events for bots

            res.status(200).json({ received: true });
          } catch (error) {
            console.error("[HTTP] Error processing event:", error);
            res.status(500).json({ error: "Internal server error" });
          }
        });

        try {
            // Start server
            const port = 3000;
            this.httpServer = app.listen(port, () => {
                console.log(`[HTTP] Server listening on port ${port}`);
            });
        }catch(e) {
            console.error(e, "API is not running")
        }*/
  }
}

/**
 * Main entry point
 *
 * Creates and starts the orchestrator
 * Handles graceful shutdown on SIGTERM/SIGINT
 */
async function main() {
  const orchestrator = new WebSocketOrchestrator();

  // Graceful shutdown handlers
  process.on("SIGTERM", async () => {
    console.log("[Main] Received SIGTERM, shutting down gracefully...");
    await orchestrator.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[Main] Received SIGINT, shutting down gracefully...");
    await orchestrator.stop();
    process.exit(0);
  });

  // Start orchestrator
  try {
    await orchestrator.start();

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error("[Main] Fatal error:", error);
    process.exit(1);
  }
}

console.log(import.meta);

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
