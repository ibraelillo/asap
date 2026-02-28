import { Resource } from "sst";
import { EventBridgeHandler } from "aws-lambda";

/**
 * EventBridge to Fargate Bridge Lambda
 *
 * Purpose: Forward EventBridge events to the Fargate orchestrator via HTTP
 *
 * Why this exists:
 * - EventBridge cannot directly invoke Fargate services
 * - EventBridge can only target: Lambda, SQS, SNS, Step Functions, API Gateway, etc.
 * - This Lambda acts as a bridge between EventBridge and Fargate
 *
 * Architecture:
 * 1. EventBridge receives event (from DynamoDB Stream, WebSocket, etc.)
 * 2. EventBridge triggers this Lambda function
 * 3. Lambda forwards event to Fargate via HTTP POST
 * 4. Fargate orchestrator receives event at /events endpoint
 *
 * Benefits:
 * - Enables Fargate to receive EventBridge events
 * - Uses ECS Service Discovery for automatic endpoint resolution
 * - Decouples event routing from orchestrator implementation
 * - Allows orchestrator to process events alongside WebSocket data
 *
 * Use cases:
 * - Bot configuration changes from DynamoDB
 * - Manual triggers from other services
 * - System events (startup, shutdown, health checks)
 *
 * Cost: ~$0.20 per million requests (Lambda invocations)
 *
 * @param e - EventBridge event containing detail, source, and metadata
 */
export const handler: EventBridgeHandler<any, any, any> = async (e) => {
  console.log("[Bridge] Forwarding event to orchestrator:", {
    source: e.source,
    detailType: e["detail-type"],
    time: e.time,
  });

  try {
    console.log(e);
    // Forward event to Fargate orchestrator via HTTP
    // Resource.Orquestrator.url is automatically resolved via ECS Service Discovery
    const response = await fetch(`${Resource.Orquestrator.url}/events`, {
      method: "POST",
      body: JSON.stringify(e),
      headers: {
        "Content-Type": "application/json",
        "X-Event-Source": e.source,
        "X-Event-Type": e["detail-type"],
      },
    });

    if (!response.ok) {
      console.error("[Bridge] Failed to forward event:", {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log("[Bridge] Event forwarded successfully");
  } catch (error) {
    console.error("[Bridge] Error forwarding event to orchestrator:", error);
    // Re-throw to trigger Lambda retry mechanism
    throw error;
  }
};
