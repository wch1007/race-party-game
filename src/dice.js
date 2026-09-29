// Integer face normals are authoritative. Animation never determines the result.
export const NORMALS = {
  1: [0, 1, 0],
  6: [0, -1, 0],
  3: [-1, 0, 0],
  4: [1, 0, 0],
  2: [0, 0, 1],
  5: [0, 0, -1],
};
export const DIRECTIONS = {
  right: "向右",
  left: "向左",
  up: "向上",
  down: "向下",
};
export const freshOrientation = () => structuredClone(NORMALS);
export const topFace = (o) => Number(Object.keys(o).find((k) => o[k][1] === 1));
export function rotate(o, dir, steps = 1) {
  let next = structuredClone(o);
  for (let i = 0; i < steps; i++)
    next = Object.fromEntries(
      Object.entries(next).map(([face, [x, y, z]]) => [
        face,
        dir === "right"
          ? [y, -x, z]
          : dir === "left"
            ? [-y, x, z]
            : dir === "up"
              ? [x, z, -y]
              : [x, -z, y],
      ]),
    );
  return next;
}
export function randomOrientation(rng = Math.random) {
  const all = [freshOrientation()],
    seen = new Set([JSON.stringify(freshOrientation())]);
  for (let i = 0; i < all.length; i++)
    for (const dir of ["right", "up"]) {
      const o = rotate(all[i], dir),
        key = JSON.stringify(o);
      if (!seen.has(key)) {
        seen.add(key);
        all.push(o);
      }
    }
  return structuredClone(all[Math.min(23, Math.floor(rng() * 24))]);
}
export function probabilities(power = 0.3, kind = "wind") {
  const p = Math.max(0, Math.min(1, Number.isFinite(power) ? power : 0.3));
  // At 30%: exactly 1/2 unchanged, 1/3 quarter turn, 1/6 half turn.
  if (kind === "wind") {
    const stay = p <= 0.3 ? 0.8 - p : Math.max(0.08, 0.5 - (p - 0.3) * 0.6);
    const two = p <= 0.3 ? 1 / 15 + p / 3 : 1 / 6 + (p - 0.3) * 0.45;
    return [stay, 1 - stay - two, two];
  }
  const stay = 0.58 - 0.5 * p,
    three = 0.04 + 0.12 * p,
    two = 0.12 + 0.25 * p;
  return [stay, 1 - stay - two - three, two, three];
}
export function preview(o, dir, power, kind = "wind") {
  return probabilities(power, kind).map((probability, steps) => ({
    probability,
    steps,
    face: topFace(rotate(o, dir, steps)),
  }));
}
export function intervene(o, dir, power, kind = "wind", rng = Math.random) {
  const options = preview(o, dir, power, kind);
  let n = rng(),
    choice = options.at(-1);
  for (const option of options) {
    n -= option.probability;
    if (n < 0) {
      choice = option;
      break;
    }
  }
  return {
    ...choice,
    orientation: rotate(o, dir, choice.steps),
    dir,
    kind,
    power,
  };
}
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIRECTION_VECTORS = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
};
export function validTablePoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z))
    return false;
  // The felt is an octagon: radius 5.13, rotated exactly like the rendered tray.
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * Math.PI) / 4;
    if (
      point.x * Math.sin(a) + point.z * Math.cos(a) >
      5.13 * Math.cos(Math.PI / 8) - 0.08
    )
      return false;
  }
  return true;
}
export function throwPosition(gesture) {
  const p = {
    x: Math.max(-2.5, Math.min(2.5, (gesture?.x ?? 110) * 0.012)),
    z: Math.max(-2.5, Math.min(2.5, (gesture?.z ?? -80) * 0.012)),
  };
  const length = Math.hypot(p.x, p.z);
  if (length > 3.4) {
    p.x *= 3.4 / length;
    p.z *= 3.4 / length;
  }
  return p;
}
export function hammerImpact(point, die, power) {
  const x = die.x - point.x,
    z = die.z - point.z,
    distance = Math.hypot(x, z);
  const attenuation = 0.12 + 0.88 * Math.exp(-distance / 2.4);
  const effectivePower = Math.max(0, Math.min(1, power)) * attenuation;
  const directional = Math.min(1, distance / 0.65);
  return {
    point: { ...point },
    distance,
    attenuation,
    effectivePower,
    vector:
      distance > 0.001
        ? [
            (x / distance) * effectivePower * directional,
            (z / distance) * effectivePower * directional,
          ]
        : [0, 0],
    lift: effectivePower * (1 - directional * 0.65),
    dir:
      Math.abs(x) > Math.abs(z)
        ? x > 0
          ? "right"
          : "left"
        : z > 0
          ? "down"
          : "up",
  };
}
// Merge forces first, then sample once. Submission order never changes the result.
export function combinedOutcomes(orientation, actions) {
  let x = 0,
    z = 0,
    lift = 0,
    hammer = false;
  for (const a of [...actions].sort(
    (a, b) => a.seat - b.seat || a.kind.localeCompare(b.kind),
  )) {
    x += a.vector[0];
    z += a.vector[1];
    lift += a.lift || 0;
    hammer ||= a.kind === "hammer";
  }
  const power = Math.min(1, Math.hypot(x, z) + lift);
  if (power < 1e-8)
    return [
      {
        probability: 1,
        steps: 0,
        dir: "right",
        face: topFace(orientation),
        orientation: structuredClone(orientation),
      },
    ];
  const weights = {
    right: Math.max(0, x) + lift * 0.25,
    left: Math.max(0, -x) + lift * 0.25,
    up: Math.max(0, -z) + lift * 0.25,
    down: Math.max(0, z) + lift * 0.25,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return Object.entries(weights)
    .flatMap(([dir, weight]) =>
      preview(orientation, dir, power, hammer ? "hammer" : "wind").map((o) => ({
        ...o,
        dir,
        probability: (o.probability * weight) / total,
        orientation: rotate(orientation, dir, o.steps),
      })),
    )
    .filter((o) => o.probability > 0);
}
export function combinedPreview(orientation, actions) {
  const faces = Array.from({ length: 6 }, (_, i) => ({
    face: i + 1,
    probability: 0,
  }));
  for (const o of combinedOutcomes(orientation, actions))
    faces[o.face - 1].probability += o.probability;
  return faces;
}
export function resolveForces(orientation, actions, rng = Math.random) {
  const choices = combinedOutcomes(orientation, actions);
  let n = rng(),
    chosen = choices.at(-1);
  for (const o of choices) {
    n -= o.probability;
    if (n < 0) {
      chosen = o;
      break;
    }
  }
  return {
    ...chosen,
    before: topFace(orientation),
    kind: "combined",
    power: Math.min(
      1,
      actions.reduce((n, a) => n + a.effectivePower, 0),
    ),
  };
}
