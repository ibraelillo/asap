import mqtt, { type MqttClient } from "mqtt";
import type { BotRunRecord } from "../types/ranging-dashboard";

export type RealtimeState = "disabled" | "connecting" | "connected" | "error";

export interface RealtimeErrorContext {
  source: string;
  details: string;
  timestamp: number;
}

export interface RunRealtimeMessage {
  type: "run";
  record: BotRunRecord;
}

export interface SummaryRealtimeMessage {
  type: "summary";
  summary: Record<string, unknown>;
}

export type RealtimeMessage = RunRealtimeMessage | SummaryRealtimeMessage;

interface ConnectOptions {
  onMessage: (message: RealtimeMessage) => void;
  onStateChange?: (state: RealtimeState, details?: string) => void;
  onDebug?: (message: string) => void;
  onError?: (context: RealtimeErrorContext) => void;
}

function decodePayload(payload: Uint8Array): RealtimeMessage | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as RealtimeMessage;
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }

    if (parsed.type !== "run" && parsed.type !== "summary") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getRealtimeConfig() {
  const endpoint = import.meta.env.VITE_RANGING_REALTIME_ENDPOINT;
  const authorizer = import.meta.env.VITE_RANGING_REALTIME_AUTHORIZER;
  const token = import.meta.env.VITE_RANGING_REALTIME_TOKEN;
  const topicPrefix =
    import.meta.env.VITE_RANGING_REALTIME_TOPIC_PREFIX || "asap/dev/ranging-bot";

  if (!endpoint || !authorizer) {
    return null;
  }

  return {
    endpoint,
    authorizer,
    token: token ?? "",
    topicPrefix,
  };
}

function buildClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `asap-web-${crypto.randomUUID()}`;
  }

  return `asap-web-${Date.now()}`;
}

export function connectRealtime(options: ConnectOptions): () => void {
  const config = getRealtimeConfig();

  if (!config) {
    options.onStateChange?.("disabled", "Missing realtime env configuration");
    return () => {
      return;
    };
  }

  options.onStateChange?.("connecting", "Starting realtime connection");
  options.onDebug?.(`Realtime endpoint: ${config.endpoint}`);
  options.onDebug?.(`Realtime authorizer: ${config.authorizer}`);
  options.onDebug?.(`Realtime topic prefix: ${config.topicPrefix}`);
  options.onDebug?.(`Realtime token length: ${config.token.length}`);

  const url = `wss://${config.endpoint}/mqtt?x-amz-customauthorizer-name=${encodeURIComponent(config.authorizer)}`;
  const client: MqttClient = mqtt.connect(url, {
    clean: true,
    protocolVersion: 5,
    manualConnect: true,
    clientId: buildClientId(),
    reconnectPeriod: 2_000,
    connectTimeout: 10_000,
    keepalive: 60,
    username: "",
    password: config.token || undefined,
  });

  const runTopic = `${config.topicPrefix}/runs`;
  const summaryTopic = `${config.topicPrefix}/summary`;
  let didConnect = false;
  let isClosing = false;

  const emitError = (source: string, details: string) => {
    options.onStateChange?.("error", details);
    options.onDebug?.(`[${source}] ${details}`);
    options.onError?.({
      source,
      details,
      timestamp: Date.now(),
    });
  };

  client.on("connect", () => {
    didConnect = true;
    options.onStateChange?.("connected");
    options.onDebug?.(`Connected. Subscribing to ${runTopic}, ${summaryTopic}`);

    client.subscribe([runTopic, summaryTopic], (error) => {
      if (error) {
        emitError("subscribe", error.message);
        return;
      }

      options.onDebug?.("Subscriptions active");
    });
  });

  client.on("message", (_topic, payload) => {
    const parsed = decodePayload(payload);
    if (!parsed) return;

    options.onMessage(parsed);
  });

  client.on("error", (error) => {
    emitError("client-error", error.message);
  });

  client.on("reconnect", () => {
    options.onStateChange?.("connecting", "Reconnecting");
    options.onDebug?.("Reconnecting...");
  });

  client.on("offline", () => {
    emitError("offline", "MQTT client is offline");
  });

  client.on("close", () => {
    if (isClosing) {
      options.onDebug?.("Socket closed (client shutdown)");
      return;
    }

    if (!didConnect) {
      emitError("close", "Socket closed before MQTT CONNECT was acknowledged");
      return;
    }

    options.onDebug?.("Socket closed");
  });

  client.on("disconnect", (packet) => {
    const reasonCode =
      typeof packet?.reasonCode === "number" ? String(packet.reasonCode) : "unknown";
    const reasonString =
      typeof packet?.properties?.reasonString === "string"
        ? packet.properties.reasonString
        : "";

    emitError(
      "disconnect",
      reasonString
        ? `Broker disconnect (${reasonCode}): ${reasonString}`
        : `Broker disconnect (${reasonCode})`,
    );
  });

  client.on("end", () => {
    options.onDebug?.("Client ended");
  });

  client.on("packetreceive", (packet) => {
    if (packet.cmd === "connack") {
      const reasonCode = typeof packet.reasonCode === "number" ? packet.reasonCode : -1;
      if (reasonCode !== 0) {
        const reasonString =
          typeof packet.properties?.reasonString === "string"
            ? packet.properties.reasonString
            : "";
        emitError(
          "connack",
          reasonString
            ? `CONNACK rejected (${reasonCode}): ${reasonString}`
            : `CONNACK rejected (${reasonCode})`,
        );
        return;
      }

      options.onDebug?.("CONNACK accepted");
    }
  });

  client.connect();

  return () => {
    isClosing = true;
    client.end(true);
  };
}
