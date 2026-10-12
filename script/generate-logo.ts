/**
 * One-off utility: generate logo / favicon candidates through OUR OWN ENGINE —
 * the exact `api/lib/kie.ts` path the production API uses (same model,
 * same payload builder, same polling). Run: `npx tsx script/generate-logo.ts`
 *
 * Output: attached_assets/logo-candidates/*.png
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createKieTask, waitForKieTask, type KieApiPayload } from "../api/lib/kie";

// Load .env.local without adding a dependency (this script is local-only).
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const outDir = resolve(process.cwd(), "attached_assets/logo-candidates");
mkdirSync(outDir, { recursive: true });

interface Concept extends KieApiPayload {
  name: string;
}

const concepts: Concept[] = [
  {
    name: "lemon-logo-black-favicon",
    prompt:
      "Cute modern flat vector logo badge of a cheerful little lemon mascot with a tiny happy face (closed smiling eyes, small smile), one green leaf on top. Bold simple shapes, thick clean outlines, vibrant yellow lemon, solid pure black background. The lemon fills about 85% of the square frame, edge-to-edge, perfectly centered. No text, no watermark, crisp vector illustration style, high contrast, legible as a tiny app icon.",
    aspect_ratio: "1:1",
    output_format: "png",
  },
  {
    name: "lemon-logo-cream",
    prompt:
      "Cute modern flat vector logo badge of a cheerful little lemon mascot with a tiny happy face (closed smiling eyes, small smile), one green leaf on top. Bold simple shapes, thick clean outlines, vibrant yellow lemon, solid warm cream background (#FFF6E8). The lemon fills about 85% of the square frame, edge-to-edge, perfectly centered. No text, no watermark, crisp vector illustration style, high contrast, friendly brand mark for a logo generator app.",
    aspect_ratio: "1:1",
    output_format: "png",
  },
];

async function generate(concept: Concept): Promise<void> {
  const taskId = await createKieTask(concept);
  console.log(`[${concept.name}] task ${taskId} created — waiting…`);
  const info = await waitForKieTask(taskId, { deadlineMs: 120_000, pollIntervalMs: 3_000 });
  const url = info.resultUrls[0];
  if (!url) throw new Error(`[${concept.name}] no result URL`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[${concept.name}] download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const file = resolve(outDir, `${concept.name}.png`);
  writeFileSync(file, buffer);
  console.log(`[${concept.name}] -> ${file} (${buffer.length} bytes)`);
}

(async () => {
  const only = process.argv[2];
  const toGenerate = only ? concepts.filter((c) => c.name.includes(only)) : concepts;
  for (const concept of toGenerate) {
    await generate(concept);
  }
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
