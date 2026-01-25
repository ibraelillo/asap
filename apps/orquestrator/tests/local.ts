import { config } from "dotenv";
import { WebSocketOrchestrator } from "../src/index";

config();

const orchestrator = new WebSocketOrchestrator();

orchestrator.start().catch(console.error);

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await orchestrator.stop();
  process.exit(0);
});
