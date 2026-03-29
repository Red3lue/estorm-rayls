import { startServer } from "./api/server.js";
import { startLoop } from "./loop.js";

// ─── API Server ───────────────────────────────────────────────────────────────
startServer(Number(process.env.API_PORT ?? 3001));

// ─── Agent Loop ───────────────────────────────────────────────────────────────
startLoop().catch(err => { console.error("[main] Fatal:", err); process.exit(1); });
