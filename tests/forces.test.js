import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/game.js";
import {
  freshOrientation,
  hammerImpact,
  validTablePoint,
  combinedPreview,
  resolveForces,
  seededRandom,
} from "../src/dice.js";
const make = () =>
  new Game(
    [
      ["shield", "sprint", "swap", "companion"],
      ["sprint", "shield", "swap", "companion"],
    ],
    { seed: 729 },
  );
test("felt hit geometry rejects the rim, outside corners and non-finite coordinates", () => {
  assert.ok(validTablePoint({ x: 4.2, z: 0 }));
  assert.ok(validTablePoint({ x: 2, z: 2 }));
  assert.ok(!validTablePoint({ x: 4, z: 4 }));
  assert.ok(!validTablePoint({ x: 0, z: 5.5 }));
  assert.ok(!validTablePoint({ x: NaN, z: 0 }));
});
test("hammer position changes direction and distance changes effective force", () => {
  const near = hammerImpact({ x: -0.8, z: 0 }, { x: 0, z: 0 }, 0.7),
    far = hammerImpact({ x: -4, z: 0 }, { x: 0, z: 0 }, 0.7),
    other = hammerImpact({ x: 0.8, z: 0 }, { x: 0, z: 0 }, 0.7),
    center = hammerImpact({ x: 0, z: 0 }, { x: 0, z: 0 }, 0.7);
  assert.equal(near.dir, "right");
  assert.equal(other.dir, "left");
  assert.ok(near.effectivePower > far.effectivePower * 2);
  assert.deepEqual(center.vector, [0, 0]);
  assert.ok(center.lift > 0);
  const a = combinedPreview(freshOrientation(), [
      { ...near, seat: 0, kind: "hammer" },
    ]),
    b = combinedPreview(freshOrientation(), [
      { ...far, seat: 0, kind: "hammer" },
    ]);
  assert.notDeepEqual(a, b);
});
test("submitting all players actions leaves dice unchanged until the single resolution", () => {
  const g = make();
  g.roll();
  g.openIntervention();
  const before = structuredClone(g.state.dice);
  g.interfere(0, "wind", "right", 0.3);
  g.interfere(1, "hammer", "left", 0.8, { x: -2, z: 0 });
  assert.deepEqual(g.state.dice, before);
  assert.equal(g.state.pendingActions.length, 2);
  const r = g.prepareResolution();
  assert.equal(g.state.phase, "showdown");
  assert.deepEqual(g.state.dice, before);
  assert.equal(g.interfere(1, "wind", "right", 0.5), null);
  g.settle();
  assert.deepEqual(g.state.dice, r.orientation);
  assert.equal(g.prepareResolution(), false);
});
test("combined force is order independent and opposite winds cancel", () => {
  const a = {
      seat: 0,
      kind: "wind",
      vector: [0.3, 0],
      effectivePower: 0.3,
      lift: 0,
    },
    b = {
      seat: 1,
      kind: "wind",
      vector: [-0.3, 0],
      effectivePower: 0.3,
      lift: 0,
    };
  const actions = [
    a,
    {
      ...hammerImpact({ x: 1, z: 2 }, { x: 0, z: 0 }, 0.7),
      seat: 1,
      kind: "hammer",
    },
    b,
  ];
  assert.deepEqual(
    combinedPreview(freshOrientation(), actions),
    combinedPreview(freshOrientation(), [...actions].reverse()),
  );
  assert.deepEqual(
    resolveForces(freshOrientation(), actions, seededRandom(99)),
    resolveForces(freshOrientation(), [...actions].reverse(), seededRandom(99)),
  );
  assert.equal(combinedPreview(freshOrientation(), [a, b])[0].probability, 1);
  const p = combinedPreview(freshOrientation(), [a]);
  assert.equal(p[0].probability, 0.5);
  assert.ok(Math.abs(p[2].probability - 1 / 3) < 1e-8);
});
test("showdown consumes randomness once even when settle is retried", () => {
  const g = make();
  g.roll();
  g.openIntervention();
  let calls = 0;
  g.rng = () => {
    calls++;
    return 0.9;
  };
  g.interfere(0, "wind", "right", 1);
  assert.equal(calls, 0);
  g.prepareResolution();
  g.settle();
  g.settle();
  assert.equal(calls, 1);
});
