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

test("uses the tap-place-ask flow with explicit turn handoffs", async () => {
  const source = await readFile(new URL("../app/veilbound-game.tsx", import.meta.url), "utf8");

  assert.match(source, /Step 1 · Tap a card in your hand/);
  assert.match(source, /Step 2 · Tap the center to place/);
  assert.match(source, /"Continue turn" \| "End turn" \| "See final revelation"/);
  assert.match(source, /className="resolutionAction"/);
  assert.doesNotMatch(source, /onPointerDrop|pointerDragging|dragReady/);
});
