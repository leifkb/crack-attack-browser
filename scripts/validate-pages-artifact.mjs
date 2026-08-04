import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(projectRoot, "dist-pages");
const htmlPath = resolve(outputRoot, "index.html");
const canonicalUrl = "https://leifkb.github.io/crack-attack-browser/";
const socialImageUrl = `${canonicalUrl}crack-attack-assets/logo.png`;

assert.ok(existsSync(htmlPath), "GitHub Pages build must emit index.html");
const html = readFileSync(htmlPath, "utf8");
assert.match(html, /<title>Crack Attack! — Browser Port<\/title>/);

function metaContent(property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = html.match(new RegExp(
    `<meta\\b[^>]*\\bproperty=["']${escaped}["'][^>]*>`,
    "i",
  ))?.[0];
  return tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? null;
}

assert.match(
  html,
  new RegExp(`<link\\b[^>]*\\brel=["']canonical["'][^>]*\\bhref=["']${canonicalUrl}["']`),
);
assert.equal(metaContent("og:title"), "Crack Attack! — Browser Port");
assert.equal(metaContent("og:type"), "website");
assert.equal(metaContent("og:url"), canonicalUrl);
assert.equal(
  metaContent("og:description"),
  "A playable single-player browser port of the open-source puzzle game Crack Attack!",
);
assert.equal(metaContent("og:image"), socialImageUrl);
assert.equal(metaContent("og:image:secure_url"), socialImageUrl);
assert.equal(metaContent("og:image:type"), "image/png");
assert.equal(metaContent("og:image:width"), "256");
assert.equal(metaContent("og:image:height"), "256");
assert.equal(metaContent("og:image:alt"), "Crack Attack! game logo");
assert.equal(metaContent("og:site_name"), "Crack Attack! — Browser Port");
assert.equal(metaContent("og:locale"), "en_US");
assert.doesNotMatch(
  html,
  /(?:href|src)=["']\/(?!\/)/,
  "GitHub Pages HTML must not use origin-root asset URLs",
);

for (const asset of [
  "COPYING.txt",
  "crack-attack-assets/block.obj",
  "crack-attack-assets/logo.png",
  "crack-attack-assets/font0_score.png",
  "crack-attack-assets/message_game_over.png",
]) {
  assert.ok(existsSync(resolve(outputRoot, asset)), `Missing Pages asset: ${asset}`);
}

const javaScriptFiles = readdirSync(resolve(outputRoot, "assets"))
  .filter((filename) => filename.endsWith(".js"));
assert.ok(javaScriptFiles.length > 0, "GitHub Pages build must emit a JavaScript bundle");
const javaScript = javaScriptFiles
  .map((filename) => readFileSync(resolve(outputRoot, "assets", filename), "utf8"))
  .join("\n");
assert.match(javaScript, /crack-attack-assets\//);
assert.match(javaScript, /logo\.png/);
assert.doesNotMatch(
  javaScript,
  /["'`]\/crack-attack-assets\//,
  "the game bundle must resolve artwork beneath the Pages project path",
);

console.log("Validated repository-subpath-safe GitHub Pages artifact.");
