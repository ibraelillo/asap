// bot-entity.ts
import { Entity } from "electrodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({});

export type Repo = ReturnType<typeof createRepo>;

export const createRepo = (table: string) =>
  new Entity(
    {
      model: {
        entity: "bot",
        version: "1",
        service: "trading",
      },
      attributes: {
        id: {
          type: "string",
          required: true,
        },
        symbol: {
          type: "string",
          required: true,
        },
        side: {
          type: ["LONG", "SHORT"] as const,
          required: true,
        },
        state: {
          type: "any", // store serialized BotState
          required: true,
        },
        updatedAt: {
          type: "number",
          required: true,
          default: Date.now,
          watch: "*",
          readOnly: true,
        },
      },
      indexes: {
        byBot: {
          pk: {
            // ✅ PK = SYMBOL#SIDE
            field: "id",
            composite: ["id"],
          },
          sk: {
            field: "symbol",
            composite: ["symbol"],
          },
        },
      },
    },
    {
      table,
      client,
    },
  );
