import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocketOrchestrator } from "../src/index";

describe("WebSocketOrchestrator", () => {
  let orchestrator: WebSocketOrchestrator;

  beforeEach(async () => {
    //process.env.EVENT_BUS_NAME = "test-bus";
    //process.env.TABLE_NAME = "test-table";
    orchestrator = new WebSocketOrchestrator();
    await orchestrator.start();
  });

  afterEach(async () => {
    await orchestrator.stop();
  });

  it("should initialize", () => {
    expect(orchestrator).toBeDefined();
  });
});
