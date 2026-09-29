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
