import express, { Application, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import swaggerUi from "swagger-ui-express";
import routes from "./src/routes";
import helmet from "helmet";

dotenv.config();

const app: Application = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

const swaggerPath = path.resolve(__dirname, "..", "swagger.json");
let swaggerDocument: Record<string, unknown> | null = null;

if (fs.existsSync(swaggerPath)) {
  try {
    swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, "utf-8"));
  } catch (error) {
    console.error("Failed to parse swagger.json", error);
  }
} else {
  console.warn(`Swagger definition not found at ${swaggerPath}. /docs route disabled.`);
}

if (swaggerDocument) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use(routes);

// Basic error handler for uncaught errors within the request pipeline.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error", err);
  res.status(500).json({ message: "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`AI Sports Oracle listening on port ${port}`);
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("Unhandled promise rejection", reason);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down.");
  process.exit(0);
});
