import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const gameComponent = readFileSync(
  new URL("../app/game/CrackAttackGame.tsx", import.meta.url),
  "utf8",
);

test("directional feedback follows explicit pointer state instead of sticky pseudostates", () => {
  assert.match(
    styles,
    /\.pad-zone\.is-pressed\s*\{[^}]*background:\s*rgba\(120, 137, 235, 0\.08\);[^}]*color:\s*#ffffff;/s,
  );
  assert.doesNotMatch(styles, /\.pad-zone:(?:hover|active)/);
  assert.match(
    gameComponent,
    /pressedDirection:\s*gesture\.movedCursor \? null : gesture\.tapDirection/,
  );
  assert.match(
    gameComponent,
    /thumbpadVisual\.pressedDirection === "up" \? " is-pressed" : ""/,
  );
});

test("landscape touch controls override the runtime flex layout with a sized grid", () => {
  const landscapeStart = styles.indexOf(
    "@media (orientation: landscape) and (max-height: 600px) and (any-pointer: coarse)",
  );
  const landscapeEnd = styles.indexOf("@media (prefers-reduced-motion: reduce)", landscapeStart);

  assert.notEqual(landscapeStart, -1);
  assert.notEqual(landscapeEnd, -1);

  const landscapeStyles = styles.slice(landscapeStart, landscapeEnd);

  assert.match(
    landscapeStyles,
    /\.touch-console,\s*\.game-experience\[data-touch-controls="true"\] \.touch-console\s*\{[^}]*display:\s*grid;/s,
  );
  assert.match(
    landscapeStyles,
    /grid-template-columns:\s*minmax\(120px, 1\.35fr\) repeat\(2, minmax\(64px, 0\.75fr\)\);/,
  );
  assert.match(
    landscapeStyles,
    /\.gesture-pad,\s*\.console-button\s*\{[^}]*width:\s*100%;/s,
  );
});
