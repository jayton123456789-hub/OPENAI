import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeck,
  chooseAIBank,
  chooseAIInquiry,
  createGame,
  resolveBank,
  resolveInquiry,
  scorePlayer,
  WIN_SCORE,
} from "../lib/veilbound.ts";
import { createOnlineGameView } from "../lib/online-room.ts";

function newDuel(seed = 41) {
  return createGame(
    [
      { name: "You", kind: "human" },
      { name: "The Curator", kind: "ai" },
    ],
    { mode: "solo", difficulty: "seer", seed },
  );
}

test("deals the familiar 52-card cycle and prepares an endless Veil", () => {
  const game = newDuel();
  const cards = [...game.deck, ...game.players.flatMap((player) => player.hand)];
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map((card) => card.id)).size, 52);
  assert.deepEqual(game.players.map((player) => player.hand.length), [7, 7]);
  assert.equal(game.deckCycle, 1);
  assert.equal(game.veilDraws, 0);
  const nextCycle = buildDeck(1);
  assert.equal(nextCycle.length, 52);
  assert.equal(nextCycle.some((card) => cards.some((existing) => existing.id === card.id)), false);
});

test("a successful inquiry transfers every echo and the player deliberately banks the set", () => {
  const game = newDuel();
  const deck = buildDeck();
  const warden = deck.filter((card) => card.identityId === "warden");
  game.players[0].hand = [warden[0]];
  game.players[1].hand = warden.slice(1);
  game.deck = deck.filter((card) => card.identityId !== "warden");
  game.currentPlayer = 0;

  const gathered = resolveInquiry(game, {
    actorId: "player-1",
    targetId: "player-2",
    identityId: "warden",
  });

  assert.equal(gathered.players[0].hand.filter((card) => card.identityId === "warden").length, 4);
  assert.equal(gathered.players[0].bound.length, 0, "sets are not banked automatically");
  assert.equal(gathered.players[1].hand.some((card) => card.identityId === "warden"), false);
  assert.equal(gathered.currentPlayer, 0, "successful seeker continues");

  const banked = resolveBank(gathered, {
    actorId: "player-1",
    cardIds: gathered.players[0].hand.filter((card) => card.identityId === "warden").map((card) => card.id),
  });
  assert.equal(scorePlayer(banked.players[0]), 3);
  assert.equal(banked.players[0].bound[0].cards.length, 4);
  assert.equal(banked.currentPlayer, 0, "banking does not spend the inquiry");
});

test("pairs, trios, and four-card sets score 1, 2, and 3 Bounds", () => {
  const deck = buildDeck();
  for (const [count, points] of [[2, 1], [3, 2], [4, 3]]) {
    const game = newDuel(100 + count);
    const cards = deck.filter((card) => card.identityId === "oracle").slice(0, count);
    game.players[0].hand = cards;
    game.currentPlayer = 0;
    const next = resolveBank(game, { actorId: "player-1", cardIds: cards.map((card) => card.id) });
    assert.equal(scorePlayer(next.players[0]), points);
    assert.equal(next.players[0].bound[0].points, points);
  }
});

test("the first seeker to seven Bounds wins immediately", () => {
  const game = newDuel(707);
  const pair = buildDeck().filter((card) => card.identityId === "moth").slice(0, 2);
  game.players[0].bound = Array.from({ length: 6 }, (_, index) => ({
    id: `prior-${index}`,
    identityId: "warden",
    cards: [],
    points: 1,
  }));
  game.players[0].hand = pair;
  game.currentPlayer = 0;

  const next = resolveBank(game, { actorId: "player-1", cardIds: pair.map((card) => card.id) });
  assert.equal(scorePlayer(next.players[0]), WIN_SCORE);
  assert.equal(next.status, "complete");
  assert.deepEqual(next.winnerIds, ["player-1"]);
  assert.match(next.lastMessage, /seven Bounds/);
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

test("the Veil refills forever instead of ending the match when a cycle runs out", () => {
  const game = newDuel(404);
  const cards = buildDeck();
  const warden = cards.find((card) => card.identityId === "warden");
  assert.ok(warden);
  game.players[0].hand = [warden];
  game.players[1].hand = cards.filter((card) => card.identityId === "oracle").slice(0, 2);
  game.deck = [];
  game.deckCycle = 3;
  game.currentPlayer = 0;
  const drawsBefore = game.veilDraws;

  const next = resolveInquiry(game, {
    actorId: "player-1",
    targetId: "player-2",
    identityId: "warden",
  });

  assert.equal(next.status, "active");
  assert.equal(next.veilDraws, drawsBefore + 1);
  assert.equal(next.deck.length, 51);
  assert.equal(next.deckCycle, 4);
  assert.ok(next.players[0].hand.some((card) => card.id.includes("-veil-3")));
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
    const bank = chooseAIBank(game);
    if (bank) {
      game = resolveBank(game, bank);
      continue;
    }
    const choice = chooseAIInquiry(game);
    assert.ok(choice, `AI has a legal choice on step ${step}`);
    game = resolveInquiry(game, choice);
  }

  assert.equal(game.status, "complete");
  assert.ok(Math.max(...game.players.map(scorePlayer)) >= WIN_SCORE);
  assert.ok(game.winnerIds.length >= 1);
});

test("a solo table can seat the player with two bots", () => {
  const game = createGame(
    [
      { name: "You", kind: "human" },
      { name: "The Curator", kind: "ai" },
      { name: "The Pale Seer", kind: "ai" },
    ],
    { mode: "solo", difficulty: "adept", seed: 2026 },
  );

  assert.equal(game.players.length, 3);
  assert.deepEqual(game.players.map((player) => player.hand.length), [5, 5, 5]);
  assert.deepEqual(game.players.map((player) => player.kind), ["human", "ai", "ai"]);
});

test("Seer AI follows public clues without reading hidden opponent cards", () => {
  const game = createGame(
    [
      { name: "The Curator", kind: "ai" },
      { name: "Mara", kind: "human" },
      { name: "Jonah", kind: "human" },
    ],
    { mode: "solo", difficulty: "seer", seed: 99 },
  );
  const deck = buildDeck();
  game.players[0].hand = deck.filter((card) => card.identityId === "warden").slice(0, 2);
  game.players[1].hand = deck.filter((card) => card.identityId === "oracle").slice(0, 3);
  game.players[2].hand = deck.filter((card) => card.identityId === "moth").slice(0, 3);
  game.currentPlayer = 0;
  game.events = [{
    id: "public-clue",
    turn: 4,
    actorId: "player-3",
    targetId: "player-2",
    identityId: "warden",
    text: "Jonah asks Mara, “Do you hold The Warden?”",
  }];

  const first = chooseAIInquiry(game);
  assert.deepEqual(first, {
    actorId: "player-1",
    targetId: "player-3",
    identityId: "warden",
  });

  const hiddenCardsChanged = structuredClone(game);
  hiddenCardsChanged.players[1].hand = deck.filter((card) => card.identityId === "thorn").slice(0, 3);
  hiddenCardsChanged.players[2].hand = deck.filter((card) => card.identityId === "mirror").slice(0, 3);
  assert.deepEqual(chooseAIInquiry(hiddenCardsChanged), first);
});

test("online views never expose the other seeker's hand or the deck", () => {
  const game = createGame(
    [
      { name: "Mara", kind: "human" },
      { name: "Jonah", kind: "human" },
    ],
    { mode: "online", difficulty: "seer", seed: 501 },
  );
  const opponentSecret = game.players[1].hand[0].id;
  const deckSecret = game.deck[0].id;
  const hostView = createOnlineGameView(game, 0);
  const serialized = JSON.stringify(hostView);

  assert.equal(hostView.yourHand.length, 7);
  assert.equal(hostView.players[1].handCount, 7);
  assert.equal("hand" in hostView.players[1], false);
  assert.equal(serialized.includes(opponentSecret), false);
  assert.equal(serialized.includes(deckSecret), false);
});

test("a complete online duel stays playable and private on every turn", () => {
  let game = createGame(
    [
      { name: "Mara", kind: "ai" },
      { name: "Jonah", kind: "ai" },
    ],
    { mode: "online", difficulty: "seer", seed: 1729 },
  );

  for (let step = 0; step < 5000 && game.status === "active"; step += 1) {
    for (const seat of [0, 1]) {
      const opponentSeat = seat === 0 ? 1 : 0;
      const view = createOnlineGameView(game, seat);
      const serialized = JSON.stringify(view);
      assert.equal(view.yourHand.length, game.players[seat].hand.length);
      assert.equal(view.players[opponentSeat].handCount, game.players[opponentSeat].hand.length);
      assert.equal("hand" in view.players[opponentSeat], false);
      for (const card of game.players[opponentSeat].hand) {
        assert.equal(serialized.includes(card.id), false, `seat ${seat} saw an opponent card on step ${step}`);
      }
      for (const card of game.deck) {
        assert.equal(serialized.includes(card.id), false, `seat ${seat} saw a Veil card on step ${step}`);
      }
    }

    const bank = chooseAIBank(game);
    if (bank) {
      game = resolveBank(game, bank);
      continue;
    }
    const choice = chooseAIInquiry(game);
    assert.ok(choice, `online AI has a legal choice on step ${step}`);
    game = resolveInquiry(game, choice);
  }

  assert.equal(game.status, "complete");
  assert.ok(Math.max(...game.players.map(scorePlayer)) >= WIN_SCORE);
});
