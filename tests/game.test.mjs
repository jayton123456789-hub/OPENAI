import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeck,
  chooseAIInquiry,
  createGame,
  resolveInquiry,
} from "../lib/veilbound.ts";

function newDuel(seed = 41) {
  return createGame(
    [
      { name: "You", kind: "human" },
      { name: "The Curator", kind: "ai" },
    ],
    { mode: "solo", difficulty: "seer", seed },
  );
}

test("deals a complete, unique 52-card deck", () => {
  const game = newDuel();
  const cards = [...game.deck, ...game.players.flatMap((player) => player.hand)];
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map((card) => card.id)).size, 52);
  assert.deepEqual(game.players.map((player) => player.hand.length), [7, 7]);
});

test("a successful inquiry transfers every echo and binds a full identity", () => {
  const game = newDuel();
  const deck = buildDeck();
  const warden = deck.filter((card) => card.identityId === "warden");
  game.players[0].hand = [warden[0]];
  game.players[1].hand = warden.slice(1);
  game.deck = deck.filter((card) => card.identityId !== "warden");
  game.currentPlayer = 0;

  const next = resolveInquiry(game, {
    actorId: "player-1",
    targetId: "player-2",
    identityId: "warden",
  });

  assert.deepEqual(next.players[0].bound, ["warden"]);
  assert.equal(next.players[1].hand.some((card) => card.identityId === "warden"), false);
  assert.equal(next.currentPlayer, 0, "successful seeker continues");
});

test("a denial uses the exact Draw from the Veil phrase and passes the turn", () => {
  const game = newDuel();
  const deck = buildDeck();
  const warden = deck.find((card) => card.identityId === "warden");
  const oracle = deck.find((card) => card.identityId === "oracle");
  assert.ok(warden && oracle);
  game.players[0].hand = [warden];
  game.players[1].hand = deck.filter((card) => card.identityId === "silent").slice(0, 2);
  game.deck = [oracle];
  game.currentPlayer = 0;

  const next = resolveInquiry(game, {
    actorId: "player-1",
    targetId: "player-2",
    identityId: "warden",
  });

  assert.ok(next.events.some((event) => event.text.includes("Draw from the Veil.")));
  assert.equal(next.currentPlayer, 1);
  assert.match(next.events.map((event) => event.text).join(" "), /You draw an unseen echo/);
});

test("two AI seekers can play a complete match without deadlocking", () => {
  let game = createGame(
    [
      { name: "The Curator", kind: "ai" },
      { name: "The Archivist", kind: "ai" },
    ],
    { mode: "solo", difficulty: "seer", seed: 7821 },
  );

  for (let step = 0; step < 5000 && game.status === "active"; step += 1) {
    const choice = chooseAIInquiry(game);
    assert.ok(choice, `AI has a legal choice on step ${step}`);
    game = resolveInquiry(game, choice);
  }

  assert.equal(game.status, "complete");
  assert.equal(game.players.reduce((sum, player) => sum + player.bound.length, 0), 13);
  assert.ok(game.winnerIds.length >= 1);
});

