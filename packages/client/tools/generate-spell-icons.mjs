// Spell-icon generator — calls Google's Imagen via the Gemini API to produce
// the HUD skill-bar icons. Run from the repo root:
//
//   node packages/client/tools/generate-spell-icons.mjs [spellId ...]
//
// With no arguments it generates every spell; otherwise only the listed ids.
// Requires GEMINI_API_KEY in the environment (never commit the key). Output
// PNGs land in packages/client/public/icons/<spellId>.png.

import { writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "gemini-2.5-flash-image";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// A shared style so every icon reads as one set: a single centered emblem,
// bold and legible at ~56px, on a dark slate slot background, no text.
const STYLE =
  "fantasy tactics game spell icon, single centered emblem, bold clean flat" +
  " illustration with strong readable silhouette, dark slate-blue background," +
  " soft rim lighting, vivid saturated color, no text, no letters, no border" +
  " frame, centered composition, square";

const SPELLS = {
  bash: "a heavy iron gauntlet fist punching forward, impact spark, steel grey",
  shove: "a shield bash knocking an enemy back, motion lines, steel grey",
  "ground-slam": "a fist smashing the ground, cracked rock and dust shards, earthy brown",
  bulwark: "a glowing protective kite shield, pale blue aura",
  "water-jet": "a high-pressure jet stream of water blasting forward, bright aqua blue",
  flood: "a rising pool of churning water, small wave, deep blue",
  drench: "a splash of water soaking a target, scattered droplets, aqua blue",
  "tidal-surge": "a towering curling tidal wave, foam crest, deep ocean blue",
  arc: "a jagged bolt of lightning arcing, electric yellow-white sparks",
};

async function generate(spellId, motif, apiKey, outDir) {
  const prompt = `${motif}. ${STYLE}.`;
  const response = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${spellId}: HTTP ${String(response.status)} — ${detail.slice(0, 300)}`);
  }
  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const base64 = parts.find((part) => part?.inlineData?.data)?.inlineData?.data;
  if (typeof base64 !== "string") {
    throw new Error(`${spellId}: no image in response — ${JSON.stringify(data).slice(0, 300)}`);
  }
  const file = resolve(outDir, `${spellId}.png`);
  await writeFile(file, Buffer.from(base64, "base64"));
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

  // The manifest is the client's source of truth for which icons exist, so
  // rebuild it from whatever PNGs are actually on disk.
  const present = (await readdir(outDir))
    .filter((name) => name.endsWith(".png"))
    .map((name) => name.replace(/\.png$/, ""));
  await writeFile(resolve(outDir, "manifest.json"), `${JSON.stringify(present, null, 2)}\n`);
  console.log(`manifest: ${present.length} icon(s)`);
}

await main();
