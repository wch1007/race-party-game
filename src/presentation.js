const base = import.meta.env.BASE_URL;
const arrows = { up: "↑", down: "↓", left: "←", right: "→" };
export function skillArt(def) {
  const groups = {
    mint: [
      "shield",
      "anchor",
      "cleanse",
      "freeze",
      "freeze_resist",
      "relay_shield",
      "reflect",
      "retreat_half",
      "checkpoint_guard",
      "floor_three",
    ],
    cocoa: [
      "swap",
      "mirror",
      "hook",
      "silence",
      "trap",
      "slow",
      "rotate_wind",
      "rush_clock",
      "best_of_two",
      "steal_step",
    ],
    lemon: [
      "hammer_bonus",
      "segment_quake",
      "double",
      "parity",
      "store_steps",
      "nudge",
      "fixed_four",
      "push",
    ],
  };
  const family =
    Object.keys(groups).find((k) => groups[k].includes(def.effect)) ||
    "strawberry";
  return `${base}art/${family}.png`;
}
export function cutinMarkup(def, label = def.name) {
  return `<div class="skill-cutin" role="status" style="--skill-color:${def.color}"><div class="cutin-speedlines"></div><div class="cutin-kanji">${def.glyph}</div><img src="${skillArt(def)}" alt="${def.character}技能演出立绘"/><div class="cutin-title"><small>SWEET IMPACT / 技能发动</small><strong>${label}</strong><span>${def.character}</span></div></div>`;
}
export function actionMarkup(state) {
  return state.players
    .map((p) => {
      const actions = (state.pendingActions || []).filter(
        (a) => a.seat === p.id,
      );
      return `<div class="action-card" style="--team:${p.color}"><b>P${p.id + 1} · ${p.name}</b><div>${actions.length ? actions.map((a) => `<span>${a.kind === "wind" ? `${arrows[a.dir]} 吹风` : "⌁ 振桌"} ${Math.round(a.power * 100)}%${a.distance != null ? `<small>距离 ${a.distance.toFixed(1)} · 传力 ${Math.round(a.attenuation * 100)}%</small>` : ""}</span>`).join("") : '<span class="waiting-action">等待出手…</span>'}</div></div>`;
    })
    .join("");
}
