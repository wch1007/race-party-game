import test from "node:test";
import assert from "node:assert/strict";
import {
  freshOrientation,
  rotate,
  topFace,
  probabilities,
  preview,
  intervene,
  randomOrientation,
  seededRandom,
} from "../src/dice.js";
import { Game, CHARACTERS, candidates, active, TRACK } from "../src/game.js";
const roster = ["sprint", "shield", "swap", "companion"];
const make = (id = "shield") =>
  new Game(
    [
      [
        id,
        ...CHARACTERS.filter((c) => c.id !== id)
          .slice(0, 3)
          .map((c) => c.id),
      ],
      roster,
    ],
    { seed: 372 },
  );
function result(g, n) {
  g.state.phase = "result";
  g.state.result = n;
}

test("six physical faces stay adjacent and opposite through all 24 orientations", () => {
  const seen = new Set();
  for (let seed = 0; seed < 1000; seed++) {
    const o = randomOrientation(seededRandom(seed));
    seen.add(JSON.stringify(o));
    for (const [a, b] of [
      [1, 6],
      [2, 5],
      [3, 4],
    ])
      assert.deepEqual(
        o[a].map((n) => n || 0),
        o[b].map((n) => -n || 0),
      );
    for (const dir of ["left", "right", "up", "down"])
      assert.deepEqual(rotate(o, dir, 4), o);
  }
  assert.equal(seen.size, 24);
  assert.equal(topFace(rotate(freshOrientation(), "right")), 3);
  assert.equal(topFace(rotate(freshOrientation(), "right", 2)), 6);
});
test("30% wind matches the requested 1/2, 1/3, 1/6 model", () => {
  const p = probabilities(0.3);
  assert.equal(p[0], 0.5);
  assert.ok(Math.abs(p[1] - 1 / 3) < 1e-10);
  assert.ok(Math.abs(p[2] - 1 / 6) < 1e-10);
  assert.deepEqual(
    preview(freshOrientation(), "right", 0.3).map((x) => x.face),
    [1, 3, 6],
  );
});
test("probability mass valid at every strength and observed frequencies match", () => {
  for (const kind of ["wind", "hammer"])
    for (let p = 0; p <= 1; p += 0.01) {
      const a = probabilities(p, kind);
      assert.ok(a.every((x) => x >= 0 && x <= 1));
      assert.ok(Math.abs(a.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    }
  const rng = seededRandom(87),
    counts = [0, 0, 0];
  for (let i = 0; i < 30000; i++)
    counts[intervene(freshOrientation(), "right", 0.3, "wind", rng).steps]++;
  for (let i = 0; i < 3; i++)
    assert.ok(Math.abs(counts[i] / 30000 - probabilities(0.3)[i]) < 0.012);
});
test("unassisted dice are uniform and seeded replays repeat", () => {
  const rng = seededRandom(38),
    counts = Array(6).fill(0);
  for (let i = 0; i < 12000; i++) counts[topFace(randomOrientation(rng)) - 1]++;
  const chi = counts.reduce((sum, n) => sum + (n - 2000) ** 2 / 2000, 0);
  assert.ok(chi < 15.086, `chi-square ${chi}`);
  const a = make(),
    b = make();
  a.roll();
  b.roll();
  assert.deepEqual(a.state, b.state);
});
test("40 characters, ten unique seeded candidates, independent team state", () => {
  assert.equal(CHARACTERS.length, 40);
  assert.equal(new Set(candidates(99).map((c) => c.id)).size, 10);
  const g = new Game([roster, roster]);
  g.c.cooldown = 4;
  assert.equal(active(g.state.players[1]).cooldown, 0);
  assert.throws(
    () => new Game([["sprint", "sprint", "swap", "shield"], roster]),
  );
});
test("interventions are bounded per team, validated, and forbidden outside window", () => {
  const g = make();
  assert.equal(g.interfere(0, "wind", "left", 1), null);
  g.roll();
  g.openIntervention();
  assert.equal(g.interfere(8, "wind", "left", 0.3), null);
  assert.equal(g.interfere(0, "wind", "diagonal", 0.3), null);
  assert.equal(g.interfere(0, "wind", "left", NaN), null);
  assert.ok(g.interfere(0, "wind", "right", 0.3));
  assert.equal(g.interfere(0, "wind", "right", 1), null);
  assert.equal(g.interfere(0, "hammer", "up", 1, { x: 99, z: 0 }), null);
  assert.ok(g.interfere(0, "hammer", "up", 1, { x: 0, z: 0 }));
  assert.ok(g.interfere(1, "wind", "left", 1));
  g.settle();
  assert.equal(g.interfere(1, "hammer", "up", 0.5), null);
});
test("overshooting 24 hands off, exact landing grants next baton an extra turn", () => {
  const g = make();
  g.p.pos = 23;
  result(g, 3);
  g.move();
  assert.equal(g.p.baton, 1);
  assert.equal(g.p.pos, 26);
  assert.equal(g.state.extra, false);
  const h = make();
  h.p.pos = 23;
  result(h, 1);
  h.move();
  assert.equal(h.p.baton, 1);
  assert.equal(h.state.extra, true);
  h.next();
  assert.equal(h.state.current, 0);
  assert.equal(h.p.baton, 1);
});
test("all three relay boundaries and finish work without wrapping backwards", () => {
  const g = make();
  for (const [pos, baton] of [
    [24, 1],
    [49, 2],
    [74, 3],
  ]) {
    g.p.pos = pos - 1;
    g.walk(1);
    assert.equal(g.p.baton, baton);
  }
  g.p.pos = 99;
  g.walk(1);
  assert.equal(g.state.winner, 0);
  assert.equal(g.p.pos, 100);
  const h = make();
  h.walk(-2);
  assert.equal(h.p.pos, 0);
  assert.equal(h.state.winner, null);
});
test("all tiles expose deterministic effects and chains terminate", () => {
  assert.equal(TRACK.length, 100);
  assert.ok(
    TRACK.filter((t) => t.type === "event").every(
      (t) => Math.abs(t.value) === 1,
    ),
  );
  const g = make();
  g.p.pos = 7;
  result(g, 1);
  g.move();
  assert.equal(g.p.status.frozen, true);
  g.next();
  g.state.phase = "skipped";
  g.next();
  assert.equal(g.state.phase, "skipped");
});
test("shield, double, floor, mirror, nudge, reroll and best-of-two resolve correctly", () => {
  const shield = make();
  assert.ok(shield.skill());
  assert.equal(shield.skill(), false);
  shield.p.pos = 7;
  result(shield, 1);
  shield.move();
  assert.ok(!shield.p.status.frozen);
  assert.equal(shield.p.shield, false);
  const double = make("double");
  double.skill();
  result(double, 2);
  double.move();
  assert.equal(double.p.pos, 4);
  const mirror = make("mirror_gymnast");
  result(mirror, 2);
  mirror.skill();
  assert.equal(mirror.state.result, 5);
  const nudge = make("jam_tuner");
  result(nudge, 3);
  nudge.skill(-1);
  assert.equal(nudge.state.result, 2);
  const reroll = make("sprint");
  result(reroll, 2);
  reroll.skill();
  assert.equal(reroll.state.phase, "ready");
  result(reroll, 1);
  assert.equal(reroll.canSkill(), false);
  const best = make("double_cup");
  best.skill();
  best.roll();
  best.openIntervention();
  best.state.dice = freshOrientation();
  assert.equal(best.settle(), "reroll");
  best.roll();
  best.openIntervention();
  best.state.dice = rotate(freshOrientation(), "right", 2);
  assert.equal(best.settle(), 6);
});
test("all 40 skill definitions are executable or have a rule trigger", () => {
  for (const def of CHARACTERS) {
    const g = make(def.id);
    g.state.players[1].pos = 4;
    if (def.trigger === "after_roll") result(g, 3);
    if (["before_roll", "manual", "after_roll"].includes(def.trigger))
      assert.ok(g.skill(), def.id);
    else {
      result(g, 5);
      assert.ok(g.move(), def.id);
    }
    assert.ok(
      g.state.players.every(
        (p) => Number.isFinite(p.pos) && p.pos >= 0 && p.pos <= 100,
      ),
      def.id,
    );
  }
});
test("a targeted skill without a valid opponent does not spend its cooldown", () => {
  const g = make("swap");
  assert.equal(g.skill(), false);
  assert.equal(g.c.used, false);
  assert.equal(g.c.cooldown, 0);
});
test("complete seeded four-team matches reach a winner, with valid baton state", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const pool = candidates(seed),
      g = new Game(
        Array.from({ length: 4 }, (_, i) =>
          pool.slice(i, i + 4).map((c) => c.id),
        ),
        { seed },
      );
    let turns = 0;
    while (g.state.winner === null && turns++ < 1600) {
      if (g.state.phase === "skipped") {
        g.next();
        continue;
      }
      if (g.canSkill()) g.skill();
      if (g.state.phase === "skipped") {
        g.next();
        continue;
      }
      if (g.state.phase === "ready") {
        g.roll();
        g.openIntervention();
        g.interfere(g.state.current, "wind", "right", 0.3);
        g.settle();
      }
      if (g.state.phase === "ready") continue;
      if (g.canSkill()) g.skill();
      if (g.state.phase === "ready") continue;
      if (g.state.phase === "result") g.move();
      if (g.state.phase === "moving") g.next();
    }
    assert.notEqual(g.state.winner, null, `seed ${seed}`);
    assert.equal(g.state.players[g.state.winner].baton, 3);
  }
});
