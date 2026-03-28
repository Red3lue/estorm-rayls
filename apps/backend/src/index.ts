import { observe } from "./modules/observe/index.js";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Sovereign Vault Protocol — AI Agent    ║");
  console.log("║   Observe Module (US-2C.1)               ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const snapshot = await observe();
  console.log(`[main] NAV: $${snapshot.nav.toLocaleString()}`);
  console.log(`[main] Fungibles: ${snapshot.fungibles.length}, NFTs: ${snapshot.nonFungibles.length}`);
}

main().catch(err => { console.error("[main] Fatal:", err); process.exit(1); });
