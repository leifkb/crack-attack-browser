import assert from "node:assert/strict";
import test from "node:test";

import { gameAssetUrl, publicAssetUrl } from "../app/game/assetUrl.ts";

test("public assets resolve beneath a GitHub Pages repository path", () => {
  const base = "https://example.github.io/crack-attack-browser/";
  assert.equal(
    gameAssetUrl("logo.png", base),
    "https://example.github.io/crack-attack-browser/crack-attack-assets/logo.png",
  );
  assert.equal(
    publicAssetUrl("COPYING.txt", base),
    "https://example.github.io/crack-attack-browser/COPYING.txt",
  );
});
