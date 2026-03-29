import { startLoop } from "./loop.js";

startLoop().catch(err => { console.error("[main] Fatal:", err); process.exit(1); });
