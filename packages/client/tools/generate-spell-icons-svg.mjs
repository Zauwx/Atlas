// Spell-icon generator (vector). Uses a Gemini TEXT model — free-tier, no
// billing — to emit clean SVG icons, sidestepping the paid image models.
// Run from the repo root:
//
//   node packages/client/tools/generate-spell-icons-svg.mjs [spellId ...]
//
// Requires GEMINI_API_KEY in the environment. Output SVGs land in
// packages/client/public/icons/<spellId>.svg, and manifest.json is rebuilt
// from what is on disk.

import { writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "gemini-flash-latest";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const STYLE =
  "Flat vector emblem, bold clean shapes readable at 40px, vivid saturated" +
  " color, subtle inner detail, transparent background (no backing rect), no" +
  " text, no letters, centered, drawn to fill a 64x64 viewBox.";

const SPELLS = {
  bash: "a heavy iron gauntlet fist, impact spark, steel grey",
  shove: "a shield shoving forward with motion lines, steel grey",
  "ground-slam": "a fist smashing cracked ground with rock shards, earthy brown",
  bulwark: "a glowing protective kite shield, pale blue",
  "water-jet": "a high-pressure jet stream of water, aqua blue",
  flood: "a rising curling wave of water, deep blue",
  drench: "a splash of water with droplets, aqua blue",
  "tidal-surge": "a towering tidal wave with foam crest, ocean blue",
  arc: "a jagged lightning bolt with sparks, electric yellow",
};

function extractSvg(text) {
  const match = /<svg[\s\S]*<\/svg>/i.exec(text);
  return match ? match[0] : null;
}

async function requestSvg(motif, apiKey) {
  const prompt =
    `Generate a single SVG icon of ${motif} for an isometric fantasy tactics` +
    ` game spell. ${STYLE} Output ONLY the raw <svg>...</svg> markup with a` +
    ` viewBox="0 0 64 64" and no width/height attributes — nothing else.`;
  const response = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)} — ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
  return extractSvg(text);
}

async function generate(spellId, motif, apiKey, outDir) {
  // The flash model occasionally returns an empty part; a couple of retries
  // make a full-set run reliable.
  let svg = null;
  for (let attempt = 0; attempt < 3 && svg === null; attempt += 1) {
    svg = await requestSvg(motif, apiKey);
  }
  if (svg === null) {
    throw new Error(`${spellId}: no SVG after 3 attempts`);
  }
  const file = resolve(outDir, `${spellId}.svg`);
  await writeFile(file, `${svg}\n`);
  return file;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set in the environment.");
    process.exit(1);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, "../public/icons");
  await mkdir(outDir, { recursive: true });

  const requested = process.argv.slice(2);
  const ids = requested.length > 0 ? requested : Object.keys(SPELLS);
  for (const id of ids) {
    const motif = SPELLS[id];
    if (motif === undefined) {
      console.error(`Unknown spell id: ${id}`);
      continue;
    }
    try {
      const file = await generate(id, motif, apiKey, outDir);
      console.log(`ok  ${id} -> ${file}`);
    } catch (error) {
      console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const present = (await readdir(outDir))
    .filter((name) => name.endsWith(".svg") || name.endsWith(".png"))
    .map((name) => name.replace(/\.(svg|png)$/, ""));
  await writeFile(
    resolve(outDir, "manifest.json"),
    `${JSON.stringify([...new Set(present)], null, 2)}\n`,
  );
  console.log(`manifest: ${new Set(present).size} icon(s)`);
}

await main();
