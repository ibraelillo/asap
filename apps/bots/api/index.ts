import { Hono } from "hono";
import { cors } from "hono/cors";
import { BotConfigRepository } from "@repo/bot-config";
import { Resource } from "sst";

const repo = new BotConfigRepository(Resource.Bots.name);

export const app = new Hono()
  .use(
    "*",
    cors({
      origin: ["http://localhost:5173", "https://*.amazonaws.com"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  )

  // Get all bots
  .get("/bots", async (c) => {
    try {
      const bots = await repo.getEnabled();
      return c.json(bots);
    } catch (error) {
      return c.json({ error: "Failed to fetch bots" }, 500);
    }
  })

  // Get bot by ID
  .get("/bots/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const bot = await repo.getById(id);
      return c.json(bot);
    } catch (error) {
      return c.json({ error: "Bot not found" }, 404);
    }
  })

  // Create bot
  .post("/bots", async (c) => {
    try {
      const body = await c.req.json();
      console.log(body);
      const bot = await repo.create(body);
      return c.json(bot, 201);
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to create bot" }, 400);
    }
  })

  // Update bot
  .put("/bots/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();
      const bot = await repo.update(id, body);
      return c.json(bot);
    } catch (error) {
      return c.json({ error: "Failed to update bot" }, 400);
    }
  })

  // Toggle bot enabled status
  .patch("/bots/:id/toggle", async (c) => {
    try {
      const id = c.req.param("id");
      const bot = await repo.getById(id);
      const updated = await repo.update(id, { enabled: !bot.enabled });
      return c.json(updated);
    } catch (error) {
      return c.json({ error: "Failed to toggle bot" }, 400);
    }
  })

  // Delete bot
  .delete("/bots/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await repo.delete(id);
      return c.json({ success: true });
    } catch (error) {
      return c.json({ error: "Failed to delete bot" }, 400);
    }
  });

export type AppType = typeof app;
