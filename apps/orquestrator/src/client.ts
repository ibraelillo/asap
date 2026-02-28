import {
  ClientOptionBuilder,
  DefaultClient,
  GlobalFuturesApiEndpoint,
  WebSocketClientOptionBuilder,
  Futures,
} from "kucoin-universal-sdk";
//import { Resource } from "sst";

/**
 * KuCoin API Configuration
 *
 * Credentials are injected by SST from the Linkable resource defined in sst.config.ts
 * In production, these should be stored in AWS Secrets Manager
 */
export const config = {
  kucoin: {
    apiKey: process.env.KUCOIN_API_KEY ?? "",
    apiSecret: process.env.KUCOIN_API_SECRET ?? "",
    passphrase: process.env.KUCOIN_API_PASSPHRASE ?? "",
  },
};

/**
 * WebSocket Client Options
 *
 * Uses default settings from KuCoin SDK:
 * - Auto-reconnect on disconnect
 * - Ping/pong heartbeat to keep connection alive
 * - Message queue for handling bursts
 */
const wsOption = new WebSocketClientOptionBuilder().build();

/**
 * KuCoin Client Configuration
 *
 * Builder pattern to configure the KuCoin SDK client:
 * - API credentials for authentication
 * - Futures endpoint for perpetual contracts
 * - WebSocket options for real-time data
 */
const clientOption = new ClientOptionBuilder()
  .setKey(config.kucoin.apiKey)
  .setSecret(config.kucoin.apiSecret)
  .setPassphrase(config.kucoin.passphrase)
  .setFuturesEndpoint(GlobalFuturesApiEndpoint)
  .setWebSocketClientOption(wsOption)
  .build();

/**
 * KuCoin SDK Client
 *
 * Main client instance for interacting with KuCoin API
 * Provides access to REST API and WebSocket services
 */
export const client = new DefaultClient(clientOption);

/**
 * WebSocket Service
 *
 * Factory for creating WebSocket connections
 */
export const ws = client.wsService();

/**
 * Futures Private WebSocket
 *
 * Authenticated WebSocket for private data:
 * - Position updates
 * - Order updates
 * - Account balance changes
 * - Margin calls
 *
 * Requires API credentials for authentication
 */
export const fWs: Futures.FuturesPrivateWS = ws.newFuturesPrivateWS();

/**
 * Futures Public WebSocket
 *
 * Unauthenticated WebSocket for public market data:
 * - Ticker (price) updates
 * - Order book changes
 * - Trade executions
 * - Funding rate updates
 *
 * Does not require authentication
 */
export const fpWs: Futures.FuturesPublicWS = ws.newFuturesPublicWS();

/**
 * Start WebSocket Connections
 *
 * Initializes both private and public WebSocket connections to KuCoin.
 * This must be called before subscribing to any channels.
 *
 * Process:
 * 1. Requests WebSocket token from KuCoin REST API
 * 2. Establishes WebSocket connection
 * 3. Authenticates (for private WS)
 * 4. Starts ping/pong heartbeat
 *
 * @throws Error if connection fails or authentication fails
 */
export const start = async () => {
  await fWs.start();
  await fpWs.start();
};

/**
 * Stop WebSocket Connections
 *
 * Gracefully closes both private and public WebSocket connections.
 * Should be called during application shutdown.
 *
 * Process:
 * 1. Unsubscribes from all active channels
 * 2. Stops ping/pong heartbeat
 * 3. Closes WebSocket connection
 * 4. Cleans up resources
 */
export const stop = async () => {
  await fWs.stop();
  await fpWs.stop();
};
