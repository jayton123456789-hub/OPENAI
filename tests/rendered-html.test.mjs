import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("uses clear Ask and Bank flows with an endless Veil and explicit handoffs", async () => {
  const source = await readFile(new URL("../app/veilbound-game.tsx", import.meta.url), "utf8");

  assert.match(source, /type TurnMode = "ask" \| "bank"/);
  assert.match(source, /Select 2–4 matching cards/);
  assert.match(source, /The Endless Veil/);
  assert.match(source, /LOCK · \+/);
  assert.match(source, /FIRST TO \{WIN_SCORE\}/);
  assert.match(source, /"Continue turn" \| "End turn" \| "See final revelation"/);
  assert.match(source, /className="resolutionAction"/);
  assert.doesNotMatch(source, /onPointerDrop|pointerDragging|dragReady/);
});

test("ships the collection hub and Realm Roll as complete routes", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("realm-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };

  for (const path of ["/", "/veilbound", "/realm-roll"]) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, ctx);
    assert.equal(response.status, 200, `${path} renders`);
  }

  const source = await readFile(new URL("../app/realm-roll-game.tsx", import.meta.url), "utf8");
  assert.match(source, /A fantasy Skee-Ball game/);
  assert.match(source, /LOCK TARGET/);
  assert.match(source, /LOCK POWER/);
  assert.match(source, /ROLL THE BALL/);
  assert.match(source, /You never drag the ball/);
  assert.match(source, /Private lane/);
  assert.match(source, /Practice against a Novice/);
  assert.doesNotMatch(source, /onPointerDrop|draggable=true|dragReady/);
});
