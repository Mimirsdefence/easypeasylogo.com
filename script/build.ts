import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, cp } from "fs/promises";

// ... (allowlist stays the same)

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  // ADDED: Force copy all static files
  console.log("copying static files...");
  await cp("client/public", "dist/public", { recursive: true, force: true });

  console.log("building server...");
  // ... rest of your code
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});