import { handle } from "hono/aws-lambda";

import { app } from "./api/index";

export const handler = handle(app);
