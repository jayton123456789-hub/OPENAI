import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseRealmAIShot,
  createRealmGame,
  getRealmTarget,
  REALM_ROUNDS,
  REALM_TARGETS,
  REGULATION_BALLS,
  resolveRealmShot,
} from "../lib/realm-roll.ts";
import { createRealmOnlineGameView } from "../lib/realm-online-room.ts";

function duel(seed = 81) {
  return createRealmGame(
    [
      { name: "You", kind: "human" },
      { name: "The Lane Warden", kind: "ai" },
    ],
    { mode: "solo", difficulty: "royal", seed },
  );
}

function perfectShot(game, targetId, actorId = game.players[game.currentPlayer].id) {
  const target = getRealmTarget(targetId);
  return resolveRealmShot(game, { actorId, targetId, power: target.idealPower, accuracy: .5 });
}

test("Realm Roll exposes the familiar Skee-Ball scoring lane", () => {
  assert.deepEqual(REALM_TARGETS.map((target) => target.points), [10, 20, 30, 40, 50, 100, 100]);
  assert.equal(REALM_ROUNDS, 3);
  assert.equal(REGULATION_BALLS, 15);
});

test("a centered, correctly powered roll scores the selected realm", () => {
  const game = duel(2026);
  const next = perfectShot(game, "crown");
  assert.equal(next.lastShot.points, 50);
  assert.equal(next.lastShot.scoredTargetId, "crown");
  assert.equal(next.lastShot.perfect, true);
  assert.equal(next.players[0].score, 50);
  assert.equal(next.players[0].shotsTaken, 1);
  assert.equal(next.currentPlayer, 1);
});

test("Dragon Gates award 100 points but remain small high-risk targets", () => {
  const game = duel(990);
  const dragon = getRealmTarget("dragon-left");
  const perfect = resolveRealmShot(game, { actorId: "roller-1", targetId: dragon.id, power: dragon.idealPower, accuracy: .5 });
  assert.equal(perfect.lastShot.points, 100);
  assert.ok(dragon.radius < getRealmTarget("crown").radius);

  const miss = resolveRealmShot(game, { actorId: "roller-1", targetId: dragon.id, power: 0, accuracy: 0 });
  assert.equal(miss.lastShot.points, 0);
});

test("power controls height and accuracy controls horizontal impact", () => {
  const game = duel(444);
  const target = getRealmTarget("moon");
  const lowLeft = resolveRealmShot(game, { actorId: "roller-1", targetId: target.id, power: .2, accuracy: .1 }).lastShot;
  const highRight = resolveRealmShot(game, { actorId: "roller-1", targetId: target.id, power: .95, accuracy: .9 }).lastShot;
  assert.ok(lowLeft.impactY > target.y, "low power lands lower on the board");
  assert.ok(highRight.impactY < target.y, "high power climbs above the target");
  assert.ok(lowLeft.impactX < target.x);
  assert.ok(highRight.impactX > target.x);
});

test("players alternate every ball and receive fifteen regulation shots", () => {
  let game = duel(321);
  for (let shot = 0; shot < REGULATION_BALLS * 2 && game.status === "active"; shot += 1) {
    const targetId = shot % 2 ? "river" : "meadow";
    game = perfectShot(game, targetId);
  }
  assert.equal(game.players.every((player) => player.shotsTaken >= REGULATION_BALLS), true);
  assert.equal(game.status, "complete");
  assert.deepEqual(game.winnerIds, ["roller-2"]);
});

test("a regulation tie enters Sudden Roll and resolves after one ball each", () => {
  let game = duel(77);
  game.players[0].score = 100;
  game.players[0].shotsTaken = REGULATION_BALLS;
  game.players[1].score = 100;
  game.players[1].shotsTaken = REGULATION_BALLS - 1;
  game.currentPlayer = 1;

  game = resolveRealmShot(game, { actorId: "roller-2", targetId: "dragon-left", power: 0, accuracy: 0 });
  assert.equal(game.suddenDeath, true);
  assert.equal(game.status, "active");
  assert.deepEqual(game.tiebreakerIds, ["roller-1", "roller-2"]);

  game = perfectShot(game, "crown", "roller-1");
  assert.equal(game.status, "active", "both tied players receive one sudden ball");
  game = resolveRealmShot(game, { actorId: "roller-2", targetId: "dragon-right", power: 0, accuracy: 1 });
  assert.equal(game.status, "complete");
  assert.deepEqual(game.winnerIds, ["roller-1"]);
});

test("Royal AI changes targets under pressure and completes full matches", () => {
  let game = createRealmGame(
    [
      { name: "The Lane Warden", kind: "ai" },
      { name: "The High Roller", kind: "ai" },
    ],
    { mode: "solo", difficulty: "royal", seed: 1776 },
  );
  for (let step = 0; step < 200 && game.status === "active"; step += 1) {
    const action = chooseRealmAIShot(game);
    assert.ok(action, `AI has a legal roll at step ${step}`);
    const next = resolveRealmShot(game, action);
    assert.notEqual(next, game);
    game = next;
  }
  assert.equal(game.status, "complete");
  assert.equal(game.winnerIds.length, 1);
  assert.ok(game.players.every((player) => player.shotsTaken >= REGULATION_BALLS));
  assert.ok(game.players.some((player) => player.shots.some((shot) => shot.targetId.includes("dragon") || shot.targetId === "crown")));
});

test("the engine rejects shots from the wrong player", () => {
  const game = duel();
  const target = getRealmTarget("river");
  const next = resolveRealmShot(game, { actorId: "roller-2", targetId: target.id, power: target.idealPower, accuracy: .5 });
  assert.equal(next, game);
});

test("online views expose public shots but hide the future random state", () => {
  const game = perfectShot(createRealmGame(
    [
      { name: "Mara", kind: "human" },
      { name: "Jonah", kind: "human" },
    ],
    { mode: "online", difficulty: "royal", seed: 5150 },
  ), "moon");
  const view = createRealmOnlineGameView(game);
  assert.equal(view.players[0].shots[0].points, 40);
  assert.equal(view.lastShot.points, 40);
  assert.equal("randomState" in view, false);
  assert.equal(JSON.stringify(view).includes(String(game.randomState)), false);
});
