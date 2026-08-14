import express from "express";
import path from "node:path";
import { config } from "./config";
import { sessionMiddleware } from "./auth/session";
import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { orgUnitsRouter } from "./routes/orgunits";
import { rulesRouter } from "./routes/rules";

const app = express();

app.set("trust proxy", 1); // we sit behind nginx/a reverse proxy in production

app.use(express.json());
app.use(sessionMiddleware);

app.use("/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/orgunits", orgUnitsRouter);
app.use("/api/rules", rulesRouter);

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Serve the built React app in production. During development, run
// `npm run dev:client` separately (Vite dev server on :5173 proxies /api
// and /auth here) instead of relying on this static block.
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
    return next();
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(config.port, () => {
  console.log(`Compliance Rule Manager listening on port ${config.port}`);
  console.log(`OAuth redirect URI configured as: ${config.oauthRedirectUri}`);
  console.log(
    `Live DLP API writes: ${config.enableLiveDlpApi ? "ENABLED (will attempt live rule creation, falling back to manual on failure)" : "disabled (Gmail rules always use the guided manual flow)"}`
  );
});
