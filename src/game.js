import characters from "./data/characters.json" with { type: "json" };
import originalTrack from "./data/track.json" with { type: "json" };
import {
  seededRandom,
  randomOrientation,
  freshOrientation,
  topFace,
  DIRECTION_VECTORS,
  hammerImpact,
  validTablePoint,
  throwPosition,
  resolveForces,
} from "./dice.js";

export const CHARACTERS = characters.map((c) => ({
  ...c,
  description: c.description
    .replaceAll("物理投掷", "投掷")
    .replaceAll("物理骰", "骰子")
    .replaceAll("冲量", "翻面力度"),
}));
export const COLORS = ["#ee927e", "#83c9b4", "#92b9e6", "#d3afe4"];
export const TEAM_NAMES = ["蜜桃队", "薄荷队", "海盐队", "葡萄队"];
export const RELAYS = [24, 49, 74];
export const TRACK = originalTrack.map((t) => ({
  ...t,
  ...(t.type === "event" ? { value: t.index % 2 === 0 ? -1 : 1 } : {}),
}));
export const TILE_LABELS = {
  normal: "普通格",
  finish: "起点 / 终点",
  advance: "前进 2 格",
  retreat: "后退 2 格",
  obstacle: "暂停一回合",
  relay: "接力区",
  event: "糖果事件",
};
export function candidates(seed) {
  const rng = seededRandom(seed),
    pool = [...CHARACTERS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 10);
}
export function definition(char) {
  return CHARACTERS.find((c) => c.id === char.id);
}
export const active = (p) => p.roster[p.baton];
export const effect = (p) => definition(active(p)).effect;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export class Game {
  constructor(rosters, { seed = Date.now(), ai = [], names = [] } = {}) {
    if (
      rosters.length < 2 ||
      rosters.length > 4 ||
      rosters.some(
        (r) =>
          r.length !== 4 ||
          new Set(r).size !== 4 ||
          r.some((id) => !CHARACTERS.some((c) => c.id === id)),
      )
    )
      throw Error("需要 2–4 队，每队 4 名不同角色");
    this.rng = seededRandom(seed);
    this.state = {
      seed,
      players: rosters.map((r, i) => ({
        id: i,
        name: names[i] || TEAM_NAMES[i],
        color: COLORS[i],
        ai: ai.includes(i),
        pos: 0,
        baton: 0,
        shield: false,
        status: {},
        roster: r.map((id) => ({ id, cooldown: 0, used: false, status: {} })),
      })),
      current: 0,
      turn: 1,
      phase: "ready",
      dice: freshOrientation(),
      result: 0,
      extra: false,
      traps: [],
      log: [],
      events: [],
      interventions: [],
      winner: null,
    };
    this.note("四支接力棒，一条通往终点的跑道。");
    this.begin();
  }
  get p() {
    return this.state.players[this.state.current];
  }
  get c() {
    return active(this.p);
  }
  get def() {
    return definition(this.c);
  }
  announceSkill(character = this.c, label) {
    this.state.lastSkill = {
      id: character.id,
      label,
      player: this.p.id,
      serial: (this.state.lastSkill?.serial || 0) + 1,
    };
  }
  note(text) {
    this.state.log.unshift(text);
    this.state.log = this.state.log.slice(0, 40);
  }
  begin() {
    const s = this.state,
      p = this.p,
      c = this.c;
    c.used = false;
    c.cooldown = Math.max(0, c.cooldown - 1);
    delete p.status.anchor;
    s.extra = false;
    s.result = 0;
    s.events = [];
    s.phase = p.status.frozen ? "skipped" : "ready";
    if (p.status.frozen) {
      delete p.status.frozen;
      this.note(`${p.name} 暂停本回合`);
    }
    if (
      effect(p) === "catch_up" &&
      !c.cooldown &&
      s.players.every((q) => q.pos >= p.pos)
    ) {
      c.status.catchup = 2;
      c.cooldown = 2;
    }
    this.note(`${p.name} · 第 ${p.baton + 1} 棒 ${this.def.character}`);
  }
  roll(gesture) {
    if (this.state.phase !== "ready") return false;
    this.state.phase = "rolling";
    this.state.dicePosition = throwPosition(gesture);
    this.state.pendingActions = [];
    this.state.resolution = null;
    this.state.dice = randomOrientation(this.rng);
    this.state.interventions = this.state.players.map(() => ({
      wind: false,
      hammer: false,
    }));
    return true;
  }
  openIntervention() {
    if (this.state.phase !== "rolling") return false;
    this.state.phase = "intervene";
    return true;
  }
  windowSeconds() {
    return (this.c.status.slowmo ? 7 : 5) + (this.p.status.rush ? -1.5 : 0);
  }
  interfere(seat, kind, dir, power, point = null) {
    const s = this.state,
      budget = s.interventions[seat];
    if (
      s.phase !== "intervene" ||
      !budget ||
      !["wind", "hammer"].includes(kind) ||
      budget[kind] ||
      !Number.isFinite(power) ||
      power < 0 ||
      power > 1 ||
      !DIRECTION_VECTORS[dir]
    )
      return null;
    const player = s.players[seat],
      boost =
        effect(player) === (kind === "wind" ? "wind_bonus" : "hammer_bonus")
          ? 1.25
          : 1;
    const effectivePower = clamp(power * boost, 0, 1);
    if (kind === "wind" && player.status.rotate) {
      const dirs = ["up", "right", "down", "left"];
      dir = dirs[(dirs.indexOf(dir) + 1) % 4];
    }
    if (kind === "hammer" && !validTablePoint(point)) return null;
    const impact =
      kind === "hammer"
        ? hammerImpact(point, s.dicePosition, effectivePower)
        : {
            effectivePower,
            vector: DIRECTION_VECTORS[dir].map((n) => n * effectivePower),
            lift: 0,
            dir,
          };
    const action = {
      ...impact,
      seat,
      kind,
      power,
      serial: (s.lastIntervention?.serial || 0) + 1,
    };
    budget[kind] = true;
    s.pendingActions.push(action);
    s.lastIntervention = action;
    this.note(
      player.name +
        (kind === "wind" ? "吹风" : "振桌") +
        "已蓄势，等待合力结算",
    );
    return action;
  }
  prepareResolution() {
    const s = this.state;
    if (s.phase !== "intervene") return false;
    s.phase = "showdown";
    s.resolution = resolveForces(s.dice, s.pendingActions, this.rng);
    return s.resolution;
  }
  settle() {
    const s = this.state,
      c = this.c,
      e = effect(this.p);
    if (!["intervene", "showdown", "settling"].includes(s.phase)) return false;
    if (!s.resolution) this.prepareResolution();
    if (s.resolution) s.dice = structuredClone(s.resolution.orientation);
    let value = topFace(s.dice);
    if (e === "lucky" && value === 1 && !c.status.lucky) {
      c.status.lucky = true;
      this.announceSkill(c);
      s.phase = "ready";
      this.note("幸运糖星：1 点自动重掷");
      return "reroll";
    }
    if (c.status.best) {
      if (c.status.first == null) {
        c.status.first = value;
        s.phase = "ready";
        this.note(`双骰择优：先记下 ${value} 点，再投一次`);
        return "reroll";
      }
      value = Math.max(value, c.status.first);
      delete c.status.best;
      delete c.status.first;
    }
    if (e === "floor_three" && value <= 2 && !c.cooldown) {
      value = 3;
      c.cooldown = 2;
      this.announceSkill(c);
      this.note("软底：按 3 点结算");
    }
    s.result = value;
    s.phase = "result";
    this.note(`骰子落定：${value} 点`);
    return value;
  }
  canSkill() {
    return (
      ["ready", "result"].includes(this.state.phase) &&
      !this.c.used &&
      !this.c.cooldown &&
      !this.p.status.silence &&
      (["before_roll", "manual"].includes(this.def.trigger)
        ? this.state.phase === "ready"
        : this.def.trigger === "after_roll" && this.state.phase === "result")
    );
  }
  target() {
    return this.state.players
      .filter((p) => p !== this.p && p.pos !== this.p.pos)
      .sort(
        (a, b) =>
          ((a.pos - this.p.pos + 100) % 100) -
          ((b.pos - this.p.pos + 100) % 100),
      )[0];
  }
  displaced(target, delta) {
    target.pos = clamp(target.pos + delta, 0, 99);
    this.state.events.push({
      type: "step",
      player: target.id,
      pos: target.pos,
      baton: target.baton,
    });
  }
  blocked(target, movement = true) {
    if (target.shield) {
      target.shield = false;
      this.note(`${target.name} 护盾挡住技能`);
      return true;
    }
    if (movement && target.status.anchor) {
      this.note(`${target.name} 定身锚抵挡位移`);
      return true;
    }
    if (movement && effect(target) === "reflect" && !active(target).cooldown) {
      active(target).cooldown = 2;
      this.displaced(this.p, -1);
      this.note("黏性反击：施术者退 1 格");
      return true;
    }
    return false;
  }
  skill(choice = 1) {
    if (!this.canSkill()) return false;
    const s = this.state,
      p = this.p,
      c = this.c,
      t = this.target(),
      e = this.def.effect;
    if (
      !t &&
      [
        "swap",
        "freeze",
        "push",
        "hook",
        "slow",
        "silence",
        "rush_clock",
        "rotate_wind",
      ].includes(e)
    ) {
      this.note("前方没有可施术的对手，技能保留");
      return false;
    }
    c.used = true;
    this.announceSkill(c);
    c.cooldown = this.def.cooldown;
    this.note(`${this.def.character} · ${this.def.name}`);
    switch (e) {
      case "reroll":
        s.phase = "ready";
        break;
      case "nudge":
        s.result = clamp(s.result + (choice === -1 ? -1 : 1), 1, 6);
        break;
      case "mirror":
        s.result = 7 - s.result;
        break;
      case "shield":
        p.shield = true;
        break;
      case "double":
        c.status.double = true;
        break;
      case "best_of_two":
        c.status.best = true;
        break;
      case "parity":
        c.status.parity = choice === 0 ? 0 : 1;
        break;
      case "slowmo_plus":
        c.status.slowmo = true;
        break;
      case "fixed_four":
        s.result = 4;
        s.phase = "result";
        break;
      case "store_steps":
        c.status.stored = 6;
        s.phase = "skipped";
        break;
      case "anchor":
        p.status.anchor = true;
        break;
      case "cleanse":
        p.status = {};
        break;
      case "swap":
        if (!this.blocked(t)) {
          const old = p.pos;
          this.displaced(p, t.pos - p.pos);
          this.displaced(t, old - t.pos);
        }
        break;
      case "freeze":
        if (!this.blocked(t, false))
          t.status[effect(t) === "freeze_resist" ? "slow" : "frozen"] = true;
        break;
      case "push":
        if (!this.blocked(t)) this.displaced(t, -2);
        break;
      case "hook":
        if (!this.blocked(t)) this.displaced(t, p.pos + 1 - t.pos);
        break;
      case "slow":
      case "silence":
      case "rush_clock":
      case "rotate_wind":
        if (!this.blocked(t, false))
          t.status[
            {
              slow: "slow",
              silence: "silence",
              rush_clock: "rush",
              rotate_wind: "rotate",
            }[e]
          ] = true;
        break;
      case "trap":
        s.traps.push({
          pos: p.pos,
          owner: p.id,
          expires: s.turn + s.players.length,
        });
        break;
      case "steal_step": {
        const lead = [...s.players].sort((a, b) => b.pos - a.pos)[0];
        if (lead !== p && !this.blocked(lead)) this.displaced(lead, -1);
        this.displaced(p, 1);
        break;
      }
      case "segment_quake":
        for (const q of s.players)
          if (
            q !== p &&
            Math.floor(q.pos / 25) === Math.floor(p.pos / 25) &&
            !this.blocked(q)
          )
            this.displaced(q, -1);
        break;
      default:
        return false;
    }
    return true;
  }
  walk(steps) {
    const s = this.state,
      p = this.p;
    let stopped = false;
    for (let i = 0; i < Math.abs(steps); i++) {
      p.pos = clamp(p.pos + Math.sign(steps), 0, 100);
      s.events.push({ type: "step", player: p.id, pos: p.pos, baton: p.baton });
      for (const q of s.players)
        if (q !== p && q.pos === p.pos)
          s.events.push({
            type: "encounter",
            player: p.id,
            other: q.id,
            text: ["借过，终点在等我！", "下一骰，见真章！", "一起冲呀！"][
              (p.pos + q.id) % 3
            ],
          });
      const trap = s.traps.find((t) => t.pos === p.pos && t.owner !== p.id);
      if (trap) {
        s.traps = s.traps.filter((t) => t !== trap);
        this.note("踩中黏地陷阱，停在这里");
        stopped = true;
        break;
      }
      if (p.pos === 100) break;
    }
    if (steps > 0) {
      while (p.baton < 3 && p.pos >= RELAYS[p.baton]) {
        const perfect = p.pos === RELAYS[p.baton],
          oldEffect = effect(p);
        p.baton++;
        s.extra ||= perfect;
        if (oldEffect === "relay_shield" || effect(p) === "relay_shield")
          p.shield = true;
        s.events.push({
          type: "relay",
          player: p.id,
          pos: p.pos,
          baton: p.baton,
          perfect,
        });
        this.note(
          `${perfect ? "完美接力！奖励一个回合" : "接力成功"} · ${definition(active(p)).character} 接棒`,
        );
      }
    }
    if (p.pos === 100) {
      s.winner = p.id;
      s.phase = "ended";
      this.note(`${p.name} 四棒完成，赢得比赛！`);
    }
    return stopped;
  }
  move() {
    const s = this.state;
    if (s.phase !== "result") return false;
    s.events = [];
    const c = this.c,
      p = this.p,
      e = effect(p);
    let n = s.result;
    if (c.status.double) n *= 2;
    if (c.status.parity != null) {
      const hit = s.result % 2 === c.status.parity;
      n = hit ? n + 2 : Math.max(1, n - 1);
      this.note(hit ? "奇偶押中，额外 +2" : "奇偶未中，少走 1 格");
    }
    if (e === "high_jump" && s.result >= 5 && !c.cooldown) {
      n += 2;
      c.cooldown = 1;
      s.events.push({ type: "skill", player: p.id, id: c.id });
    }
    if (e === "finish_burst" && (RELAYS[p.baton] ?? 100) - p.pos <= 8) n += 2;
    if (e === "six_extra" && s.result === 6 && !c.cooldown) {
      s.extra = true;
      c.cooldown = 2;
      s.events.push({ type: "skill", player: p.id, id: c.id });
    }
    if (p.status.slow) n = Math.max(1, n - 2);
    n += (c.status.stored || 0) + (c.status.catchup || 0);
    c.status = {};
    s.phase = "moving";
    this.note(`${p.name} 前进 ${n} 格`);
    this.walk(n);
    if (e === "carry")
      for (const q of s.players)
        if (q !== p && q.pos === p.pos && !this.blocked(q))
          this.displaced(q, n);
    let advanced = false;
    for (let chain = 0; chain < 10 && s.phase !== "ended"; chain++) {
      const tile = TRACK[p.pos],
        ce = effect(p),
        char = active(p);
      if (!tile) break;
      s.events.push({
        type: "tile",
        player: p.id,
        pos: p.pos,
        tile: tile.type,
        value: tile.value,
      });
      if (["retreat", "obstacle"].includes(tile.type)) {
        if (p.shield) {
          p.shield = false;
          s.events.push({
            type: "skill",
            player: p.id,
            id: char.id,
            label: "糖壳护盾",
          });
          this.note("糖壳护盾抵挡负面格");
          break;
        }
        if (ce === "dodge_tile" && !char.cooldown) {
          char.cooldown = 2;
          s.events.push({ type: "skill", player: p.id, id: char.id });
          this.walk(-1);
          this.note("退步避险");
          break;
        }
      }
      if (tile.type === "advance") {
        this.note("薄荷加速格 +2");
        this.walk(2);
        advanced = true;
        continue;
      }
      if (tile.type === "retreat") {
        let back = ce === "retreat_half" ? 1 : 2;
        if (ce === "checkpoint_guard") back = Math.min(back, p.pos % 25);
        this.note(`草莓回退格 −${back}`);
        if (back === 0) break;
        this.walk(-back);
        continue;
      }
      if (tile.type === "obstacle") {
        if (ce === "hurdle") {
          s.events.push({ type: "skill", player: p.id, id: char.id });
          this.note("越障，再前进 1 格");
          this.walk(1);
          continue;
        }
        p.status.frozen = true;
        this.note("障碍格：下回合暂停");
      }
      if (tile.type === "event") {
        this.note(`糖果事件：${tile.value > 0 ? "+1" : "−1"} 格`);
        this.walk(tile.value);
      }
      break;
    }
    if (advanced && effect(p) === "advance_glide" && s.phase !== "ended") {
      s.events.push({ type: "skill", player: p.id, id: active(p).id });
      this.note("加速余势 +1");
      this.walk(1);
    }
    return true;
  }
  next() {
    const s = this.state;
    if (!["moving", "skipped"].includes(s.phase)) return false;
    const extra = s.extra,
      p = this.p;
    for (const k of ["silence", "rush", "rotate", "slow"]) delete p.status[k];
    s.turn++;
    s.traps = s.traps.filter((t) => t.expires > s.turn);
    if (!extra) s.current = (s.current + 1) % s.players.length;
    this.begin();
    return true;
  }
}
