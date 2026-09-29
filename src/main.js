import "./style.css";
import { BoardScene } from "./scene.js";
import {
  Game,
  CHARACTERS,
  COLORS,
  TEAM_NAMES,
  candidates,
  active,
  definition,
  TILE_LABELS,
} from "./game.js";
import {
  combinedPreview,
  hammerImpact,
  DIRECTION_VECTORS,
  topFace,
  DIRECTIONS,
} from "./dice.js";
import { cutinMarkup, actionMarkup } from "./presentation.js";

const $ = (s) => document.querySelector(s),
  app = $("#app");
const icons = {
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4zM17 8q5 4 0 8"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 6m0-6-5 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.7C12 12 12 12 12 14m0 2v1"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  home: '<path d="M3 11l9-8 9 8M6 10v10h12V10M10 20v-7h4v7"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const skins = [
  { name: "香草奶油", color: "#fff9e8" },
  { name: "薄荷汽水", color: "#bce3ce" },
  { name: "草莓牛奶", color: "#f5c8bb" },
];
const storage = {
  get(k, fallback) {
    try {
      return localStorage.getItem(k) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
let board;
try {
  board = new BoardScene($("#scene"));
} catch (error) {
  app.innerHTML =
    '<div class="scrim"><div class="modal"><h2>暂时无法打开 3D 场景</h2><p>请使用开启硬件加速的最新版 Chrome 或 Edge，再刷新页面。</p></div></div>';
  throw error;
}
let screen = "menu",
  modal = null,
  game = null,
  mode = "solo",
  playerCount = 2,
  offer = [],
  picks = [],
  rosters = [],
  draftTeam = 0,
  paused = false,
  clock = 0,
  lastTime = performance.now(),
  tasks = [],
  generation = 0,
  deadline = 0,
  windowLength = 5,
  charge = null,
  seat = 0,
  lastDir = "right",
  lastKind = "wind",
  lastPower = 0.3,
  toastText = "",
  speechText = "",
  soundEnabled = storage.get("dice-sound", "1") === "1",
  audio = null,
  skinIndex = Number(storage.get("dice-skin", "0")) || 0,
  drag = null,
  menuSeed = Date.now(),
  net = null;
let shownSkill = 0,
  cutin = null,
  cutinSerial = 0,
  lastPoint = null,
  panMode = false;
skinIndex = Math.max(0, Math.min(2, skinIndex));
board.skin(skins[skinIndex].color);
board.focus("menu");
const schedule = (seconds, fn) =>
  tasks.push({ at: clock + seconds, fn, generation });
function beep(type = "click") {
  if (!soundEnabled) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const tones = {
      click: [420, 0.04],
      roll: [160, 0.1],
      wind: [700, 0.16],
      hammer: [70, 0.25],
      result: [660, 0.2],
      relay: [880, 0.4],
    };
    const [freq, time] = tones[type] || tones.click;
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = type === "hammer" ? "triangle" : "sine";
    o.frequency.setValueAtTime(freq, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      type === "relay" ? 1320 : freq * 0.6,
      audio.currentTime + time,
    );
    g.gain.setValueAtTime(0.07, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + time);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + time);
  } catch {
    /* Sound is optional. */
  }
}
function toast(text) {
  toastText = text;
  renderFloating();
  schedule(3, () => {
    if (toastText === text) {
      toastText = "";
      renderFloating();
    }
  });
}
function renderFloating() {
  document
    .querySelectorAll(".toast,.speech,.skill-cutin")
    .forEach((e) => e.remove());
  if (cutin)
    app.insertAdjacentHTML("beforeend", cutinMarkup(cutin.def, cutin.label));
  if (toastText)
    app.insertAdjacentHTML(
      "beforeend",
      `<div class="toast" role="status">${escape(toastText)}</div>`,
    );
  if (speechText)
    app.insertAdjacentHTML(
      "beforeend",
      `<div class="speech">${escape(speechText)}</div>`,
    );
}
function showSkill(id, label) {
  const def = CHARACTERS.find((c) => c.id === id);
  if (!def) return;
  const serial = ++cutinSerial;
  cutin = { def, label };
  beep("relay");
  renderFloating();
  schedule(1.5, () => {
    if (serial === cutinSerial) {
      cutin = null;
      renderFloating();
    }
  });
}
function avatar(c) {
  return `<span class="avatar variant-${CHARACTERS.indexOf(c) % 5}" style="--c:${c.color}"><i class="body"></i><i class="face"></i><i class="hat"></i><em>${c.glyph}</em></span>`;
}
function header() {
  return `<header class="topbar"><div class="brand"><span class="brand-icon">⚄</span><div><strong>骰子派对</strong><small>DICE & DASH</small></div></div><nav class="top-actions"><button class="textbutton" data-action="fullscreen" aria-label="切换全屏">⛶ 全屏</button>${screen === "game" ? `<button data-action="menu-confirm" aria-label="返回主菜单">${icon("home")}</button><button data-action="pause" aria-label="暂停游戏" ${net ? "disabled" : ""}>${icon("pause")}</button>` : `<button class="textbutton" data-action="skins">骰子工坊</button>`}<button data-action="sound" aria-label="${soundEnabled ? "关闭" : "开启"}音效">${icon(soundEnabled ? "sound" : "mute")}</button><button data-action="help" aria-label="游戏规则">${icon("help")}</button></nav></header>`;
}
function render() {
  if (game?.state.lastSkill && game.state.lastSkill.serial !== shownSkill) {
    shownSkill = game.state.lastSkill.serial;
    showSkill(game.state.lastSkill.id, game.state.lastSkill.label);
  }
  board.paused = paused;
  if (game)
    board.setSuspense(["intervene", "showdown"].includes(game.state.phase));
  let html = header();
  if (screen === "menu")
    html += `<main class="menu"><div class="eyebrow"><span class="live-dot"></span> A LITTLE LUCK. A LITTLE MISCHIEF.</div><h1>骰子派对<span>吹口气，翻个盘。</span></h1><p>运气落在哪一面，由你推一把。<br>带上四位搭档，跑一场热闹的接力赛。</p><button class="primary" data-action="solo">单人练习 <span class="arrow">↗</span></button><div class="menu-options"><button class="secondary" data-action="local">♧ &nbsp;本地派对</button><button class="secondary" data-action="online">⌁ &nbsp;联机房间</button></div><div class="menu-stats"><div><strong>2—4</strong><span>支队伍同场</span></div><div><strong>40</strong><span>位糖果选手</span></div><div><strong>100</strong><span>格接力赛道</span></div></div></main><div class="scene-caption">一点运气，亿点小动作。</div><div class="location"><strong>糖果运动场</strong><span>CANDY CIRCUIT · 01</span><small>拖动中键探索桌面 · 滚轮缩放</small></div><div class="version">DICE & DASH &nbsp; / &nbsp; WEB EDITION 01</div>`;
  if (screen === "draft") html += draftHTML();
  if (screen === "game" && game) html += gameHTML();
  if (modal || paused) html += modalHTML();
  app.innerHTML = html;
  renderFloating();
  updateMeters();
}
function draftHTML() {
  return `<section class="draft panel"><div class="draft-heading"><div><div class="eyebrow">BUILD YOUR RELAY TEAM</div><h2>${TEAM_NAMES[draftTeam]}，选好你的四位搭档。</h2><p>本局随机候选 10 人 · 点击选择，按选择顺序接棒 · 各队可以选同一角色</p></div><span class="tag">${picks.length} / 4 已选</span></div><div class="draft-grid">${offer.map((c) => `<button class="char-card ${picks.includes(c.id) ? "selected" : ""}" data-pick="${c.id}" aria-pressed="${picks.includes(c.id)}"><span class="skill-glyph">${c.glyph}</span>${avatar(c)}<strong>${c.character}</strong><small>${c.name} · ${c.description}</small>${picks.includes(c.id) ? `<span class="pick-index">${picks.indexOf(c.id) + 1}</span>` : ""}</button>`).join("")}</div><div class="draft-footer"><div class="roster-preview">${Array.from(
    { length: 4 },
    (_, i) => {
      const c = CHARACTERS.find((c) => c.id === picks[i]);
      return `<div class="roster-slot ${c ? "" : "empty"}">${c ? avatar(c) + `${i + 1} 棒 · ${c.character}` : "＋"}</div>`;
    },
  ).join(
    "",
  )}</div><button class="secondary" data-action="auto-pick">帮我组队</button><button class="primary" data-action="confirm-pick" ${picks.length !== 4 ? "disabled" : ""}>${mode === "online" ? "保存阵容 →" : mode === "solo" || draftTeam === playerCount - 1 ? "出发，去赛场 ↗" : "确认，下一队 →"}</button></div></section>`;
}
function gameHTML() {
  const s = game.state,
    p = s.players[s.current],
    c = active(p),
    def = definition(c),
    phase = s.phase,
    canAct = !net || net.seat === s.current;
  const phaseNames = {
    ready: "准备投骰",
    rolling: "骰子滚动中",
    intervene: "全员抢骰面",
    result: "骰子已落定",
    moving: "接力冲刺",
    skipped: "暂停一回合",
    ended: "比赛结束",
    settling: "合力翻面",
    showdown: "全员亮招",
  };
  const hasSkill = game instanceof Game ? game.canSkill() : canSkillRemote();
  const skillStatus = c.cooldown
    ? `冷却 ${c.cooldown} 回合`
    : c.used
      ? "本回合已使用"
      : ["passive", "on_land", "on_relay"].includes(def.trigger)
        ? "自动触发"
        : def.trigger === "after_roll"
          ? "落定后可用"
          : "投骰前可用";
  return `<div class="turn-indicator"><span class="live-dot"></span><b>${escape(p.name)}</b><small>TURN ${String(s.turn).padStart(2, "0")} / ${phaseNames[phase]}</small></div><aside class="scoreboard panel"><div class="panel-label">THE RACE / 接力榜</div>${s.players.map((q) => `<div class="team-row ${q.id === s.current ? "active" : ""}"><div class="team-title"><span><i class="team-color" style="background:${q.color}"></i>${escape(q.name)}</span><small>${q.ai ? "AI" : "P" + (q.id + 1)}</small></div><div class="progress"><i style="width:${q.pos}%;background:${q.color}"></i></div><div class="team-detail"><span>第 ${q.baton + 1} 棒 · ${q.pos} / 100</span><div class="batons">${[0, 1, 2, 3].map((i) => `<i class="${i <= q.baton ? "done" : ""}"></i>`).join("")}</div></div></div>`).join("")}</aside>
  ${
    phase === "intervene"
      ? interventionHTML()
      : `<aside class="log-panel panel"><div class="panel-label">TRACKSIDE / 赛场动态</div>${s.log
          .slice(0, 4)
          .map((t) => `<div class="log-line">${escape(t)}</div>`)
          .join("")}</aside>`
  }
  ${["ready", "rolling", "intervene"].includes(phase) ? `<div class="hint">${phase === "ready" ? (p.ai ? "对手正在准备投骰…" : "拖住骰子，向前甩出去") : phase === "rolling" ? "先让骰子滚一会儿…" : "就是现在，改变这一面！"}<small>${phase === "ready" ? "拖拽骰盘区域，松手投掷 · 也可点击右下角按钮" : phase === "rolling" ? "接近停稳时，所有队伍都能干预" : "每队一次吹风 + 一次振桌 · 松手提交，全员一起结算"}</small></div>` : ""}
  ${phase === "result" ? `<div class="dice-result"><strong>${s.result}</strong><p>${s.result === topFace(s.dice) ? "骰 子 落 定" : "技 能 结 算"}</p></div>` : ""}
  ${["intervene", "showdown", "settling"].includes(phase) ? `<aside class="action-board panel ${s.players.length > 2 ? "many" : ""}"><div class="panel-label">ALL PLAYERS / 全员动作</div>${actionMarkup(s)}</aside>` : ""}${phase === "showdown" ? `<div class="showdown-banner"><small>EVERY MOVE COUNTS</small><strong>全员亮招 · 合力即将爆发</strong><span>先看清每个人的小动作，再见分晓。</span></div>` : ""}
  <div class="legend"><span><i style="background:#8ec9aa"></i>前进</span><span><i style="background:#edab95"></i>后退</span><span><i style="background:#e6c77d"></i>停一回合</span><span><i style="background:#b9a7d3"></i>接力</span></div><div class="camera-controls"><select id="view-select" aria-label="切换视角"><option value="isometric" ${board.view === "isometric" ? "selected" : ""}>斜俯视角</option><option value="top" ${board.view === "top" ? "selected" : ""}>正上方全景</option><option value="cinema" ${board.view === "cinema" ? "selected" : ""}>低位观赛</option><option value="reverse" ${board.view === "reverse" ? "selected" : ""}>反向斜视</option></select><button data-action="pan-mode" class="${panMode ? "selected" : ""}">拖拽视野 ${panMode ? "开" : "关"}</button><button data-action="overview">俯瞰赛场</button><button data-action="focus">${["ready", "rolling", "intervene", "result"].includes(phase) ? "回到骰盘" : "跟随选手"}</button><button data-action="zoom-in" aria-label="放大">＋</button><button data-action="zoom-out" aria-label="缩小">−</button></div>
  <footer class="bottom-bar panel"><div class="current-character">${avatar(def)}<div><strong>${def.character}</strong><small>${escape(p.name)} / 第 ${p.baton + 1} 棒</small></div></div><button class="skill-button" data-action="skill" ${!hasSkill || p.ai || !canAct ? "disabled" : ""} title="${def.description}">${def.glyph} &nbsp; ${def.name} <span class="key">Q</span><small>${skillStatus} · ${def.description}</small></button><div class="action-area"><div class="action-copy">${phase === "ready" ? "你的下一步，从这一掷开始。" : phase === "intervene" ? "机会只有一瞬，松手见分晓。" : phase === "result" ? `本次点数 ${s.result}，准备出发。` : "让好运再跑一会儿。"}<small>${phase === "ready" ? "按住中键平移 · 滚轮缩放" : "第 24 / 49 / 74 格交棒 · 恰好到达奖励回合"}</small></div><button class="primary" data-action="primary" ${!canAct || p.ai || !["ready", "result", "skipped", "ended"].includes(phase) ? "disabled" : ""}>${phase === "ready" ? "甩出骰子 ↗" : phase === "result" ? "确认，向前跑 →" : phase === "skipped" ? "下一回合 →" : phase === "ended" ? "查看排名" : "进行中…"}</button></div></footer>`;
}
function interventionHTML() {
  const s = game.state,
    b = s.interventions[seat] || {};
  return `<aside class="intervention panel"><div class="panel-label">MAKE YOUR MOVE</div><div class="timer-row"><h3>抢骰面时刻</h3><strong id="countdown">5.0<small>s</small></strong></div><div class="timer-track"><i id="timer-fill"></i></div><div class="seat-picker">${s.players.map((p) => `<button data-seat="${p.id}" class="${seat === p.id ? "selected" : ""}" ${net && p.id !== net.seat ? "disabled" : ""}>P${p.id + 1}</button>`).join("")}</div><div class="micro">${escape(s.players[seat].name)} · 当前朝上 <b id="top-face">${topFace(s.dice)}</b> 点</div><div class="wind-pad"><button data-wind="up" ${b.wind ? "disabled" : ""} aria-label="向上吹风">↑ <small>W</small></button><button data-wind="left" ${b.wind ? "disabled" : ""} aria-label="向左吹风">← <small>A</small></button><button data-wind="down" ${b.wind ? "disabled" : ""} aria-label="向下吹风">↓ <small>S</small></button><button data-wind="right" ${b.wind ? "disabled" : ""} aria-label="向右吹风">→ <small>D</small></button></div><button class="hammer-button" data-hammer="true" ${b.hammer ? "disabled" : ""}>${b.hammer ? "✓ 本队振桌已使用" : "⌁ 按住蓄力，松手振桌"}</button><div class="power-label"><span id="power-direction">向右吹风 · 力度</span><b id="power-number">30%</b></div><div class="power-track"><i id="power-marker"></i></div><div class="probabilities" id="probabilities"></div><p class="micro" style="margin-bottom:0">按住后力度往返变化，2 秒自动释放。<br>桌布任意点可敲击；距离越近传力越强。下方是全员合力预测。</p></aside>`;
}
function modalHTML() {
  let body = "";
  let type = modal || (paused ? "pause" : null);
  if (type === "help")
    body = `<div class="eyebrow">HOW TO PLAY</div><h2>运气之外，你还可以动手。</h2><div class="rule-grid"><article><span class="rule-num">01 / RELAY</span><b>四位搭档，共跑一圈</b><p>每队选 4 人，共跑 100 格。在 24、49、74 格交棒；越过也能交接。恰好停在交棒点，下一棒立即多行动一次。</p></article><article><span class="rule-num">02 / ROLL</span><b>甩骰，等它即将停下</b><p>拖动骰盘再松手，或者点“甩出骰子”。骰子临停才打开 5 秒干预时间，完全落定后才出发。</p></article><article><span class="rule-num">03 / INTERFERE</span><b>一阵风，一次振桌</b><p>W/A/S/D 或方向按钮蓄力吹风，骰盘上按住鼠标振桌。每队各一次，点 P1–P4 切换参与队。力度越大，翻过更多面的机会越高。</p></article><article><span class="rule-num">04 / STRATEGY</span><b>看清概率，再松手</b><p>30% 轻风：50% 不变、33⅓% 翻一面、16⅔% 翻两面。翻转按真实六面相邻关系计算。技能与格子效果都提前标明。</p></article></div><p>中键拖动平移 · 滚轮缩放 · Q 使用技能 · Esc 暂停<br>后退不会越过起点，事件格按标注固定 ±1，无隐藏抽奖。</p>`;
  else if (type === "setup")
    body = `<div class="eyebrow">PASS & PLAY</div><h2>今晚，几个人一起玩？</h2><p>共用键鼠，轮流选角和投骰；抢骰面时，所有队伍都能参与。</p><div class="count-select">${[2, 3, 4].map((n) => `<button data-count="${n}" class="${n === playerCount ? "selected" : ""}">${n} 人</button>`).join("")}</div><button class="primary wide" data-action="start-local">开始选角 →</button>`;
  else if (type === "skins")
    body = `<div class="eyebrow">DICE ATELIER</div><h2>下一掷，换个心情。</h2><p>选一颗你喜欢的骰子。外观不会改变概率。</p><div class="skin-grid">${skins.map((s, i) => `<button class="skin-card ${i === skinIndex ? "selected" : ""}" data-skin="${i}"><span class="skin-die" style="--die:${s.color}">⚄</span>${s.name}</button>`).join("")}</div>`;
  else if (type === "pause")
    body = `<div class="eyebrow">TAKE A BREATHER</div><h2>歇一口气，好运等你。</h2><p>比赛和干预计时都已暂停。</p><button class="primary wide" data-action="resume">继续比赛 →</button>`;
  else if (type === "menu-confirm")
    body = `<h2>结束这场比赛？</h2><p>返回主菜单会结束当前对局。</p><button class="primary wide" data-action="exit">结束对局，返回主菜单</button>`;
  else if (type === "choice")
    body = `<h2>${definition(active(game.state.players[game.state.current])).name}</h2><p>${definition(active(game.state.players[game.state.current])).description}</p><div class="count-select">${definition(active(game.state.players[game.state.current])).effect === "parity" ? '<button data-choice="1">押奇数 1 / 3 / 5</button><button data-choice="0">押偶数 2 / 4 / 6</button>' : '<button data-choice="-1">点数 −1</button><button data-choice="1">点数 +1</button>'}</div>`;
  else if (type === "winner") {
    const s = game.state;
    body = `<div class="winner-medal">♛</div><div class="eyebrow" style="text-align:center">THE SWEETEST VICTORY</div><h2 style="text-align:center">${escape(s.players[s.winner].name)}，漂亮冲线！</h2>${[
      ...s.players,
    ]
      .sort((a, b) => b.pos - a.pos)
      .map(
        (p, i) =>
          `<div class="rank-row"><b>${i + 1} &nbsp; ${escape(p.name)}</b><span>${p.pos} / 100 格 · 第 ${p.baton + 1} 棒</span></div>`,
      )
      .join(
        "",
      )}<button class="primary wide" data-action="exit">再来一场 →</button>`;
  } else if (type === "online")
    body = `<div class="eyebrow">PLAY TOGETHER</div><h2>把好友叫到同一张桌。</h2><p>启动项目的联机服务后，填写服务器地址。局域网好友使用房主电脑的 IP 地址；支持 2–4 人。</p><label class="micro" for="server-url">服务器地址</label><div class="form-row"><input id="server-url" value="${escape(storage.get("dice-server", `ws://${location.hostname}:8787`))}" placeholder="ws://192.168.1.10:8787"/></div><div class="form-row"><input id="room-code" placeholder="六位房间码" maxlength="6" aria-label="房间码"/><button class="secondary" data-action="join-room">加入</button></div><button class="primary wide" data-action="create-room">创建房间 →</button><p id="network-status" role="status"></p>`;
  else if (type === "lobby")
    body = `<div class="eyebrow">FRIENDS AROUND THE TABLE</div><h2>房间 ${escape(net?.room || "")}</h2><p>把房间码和服务器地址发给好友。每位玩家可从同一组 10 人候选中选 4 位搭档，或使用默认阵容。房主开始后进入比赛。</p>${(net?.players || []).map((p, i) => `<div class="rank-row"><span>P${i + 1} · ${escape(p.name)}</span><b>${i === 0 ? "房主" : "已加入"}</b></div>`).join("")}<button class="secondary wide" data-action="room-draft" style="margin:12px 0">挑选我的四位搭档</button><button class="primary wide" data-action="start-room" ${net?.seat !== 0 || (net?.players?.length || 0) < 2 ? "disabled" : ""}>人齐了，开始比赛 →</button>`;
  return `<div class="scrim"><section class="modal ${type === "setup" ? "setup" : ""}" role="dialog" aria-modal="true" aria-label="${type}"><div class="modal-head"><span></span>${type !== "winner" ? '<button class="close" data-action="close" aria-label="关闭">×</button>' : ""}</div>${body}</section></div>`;
}
function startDraft(nextMode) {
  mode = nextMode;
  modal = null;
  screen = "draft";
  menuSeed = Date.now();
  offer = candidates(menuSeed);
  picks = [];
  rosters = [];
  draftTeam = 0;
  render();
}
function startGame() {
  generation++;
  tasks = [];
  game = new Game(rosters, { seed: menuSeed, ai: mode === "solo" ? [1] : [] });
  screen = "game";
  modal = null;
  seat = 0;
  board.setPlayers(game.state.players);
  board.focus("board");
  render();
  schedule(0.7, ready);
}
function ready() {
  if (!game || game.state.phase !== "ready") return;
  board.focus("dice");
  render();
  if (game.p.ai)
    schedule(0.9, () => {
      if (game.state.phase !== "ready") return;
      if (game.canSkill()) game.skill(game.rng() > 0.5 ? 1 : 0);
      render();
      if (game.state.phase === "ready") doRoll();
      else aiContinue();
    });
}
function doRoll(gesture = null) {
  if (!game) return;
  if (net) {
    send({ type: "action", action: "roll", gesture });
    return;
  }
  if (!game.roll(gesture)) return;
  charge = null;
  board.clearActions();
  board.focus("dice");
  board.setSuspense(true);
  board.orient(game.state.dice, 1.65, null, 0, gesture);
  beep("roll");
  render();
  schedule(1.7, () => {
    if (!game.openIntervention()) return;
    seat = game.p.ai ? 0 : game.state.current;
    lastPower = 0.3;
    lastDir = "right";
    lastKind = "wind";
    lastPoint = null;
    windowLength = game.windowSeconds();
    deadline = clock + windowLength;
    render();
    for (const p of game.state.players)
      if (p.ai) {
        schedule(1.1 + game.rng(), () => {
          if (game.state.phase === "intervene")
            applyIntervention(
              p.id,
              "wind",
              ["up", "right", "down", "left"][Math.floor(game.rng() * 4)],
              0.15 + game.rng() * 0.7,
            );
        });
        schedule(3, () => {
          if (game.state.phase === "intervene") {
            const die = game.state.dicePosition;
            applyIntervention(p.id, "hammer", "right", 0.5, {
              x: die.x - 1.3,
              z: die.z,
            });
          }
        });
      }
    schedule(windowLength, () => {
      if (charge) releaseCharge();
      game.prepareResolution();
      render();
      schedule(1.25, () => {
        game.state.phase = "settling";
        render();
        presentResolution(game.state);
        schedule(1.65, () => {
          game.settle();
          board.setSuspense(false);
          beep("result");
          render();
          if (game.state.phase === "ready") ready();
          else aiContinue();
        });
      });
    });
  });
}
function presentResolution(state) {
  board.setSuspense(true);
  board.holdDice(0.28);
  const result = state.resolution;
  if (!result) return;
  schedule(0.28, () => {
    board.setSuspense(false);
    for (const a of state.pendingActions) {
      const color = state.players[a.seat].color;
      if (a.kind === "wind") board.wind(a.dir, color);
      else board.hammer(a.point, color);
    }
    board.orient(result.orientation, 1.15, result.dir, result.steps);
    beep("hammer");
  });
}
function aiContinue() {
  if (game?.p.ai)
    schedule(1, () => {
      if (game.canSkill()) game.skill();
      if (game.state.phase === "result") doMove();
      else if (game.state.phase === "ready") doRoll();
      else if (game.state.phase === "skipped") nextTurn();
    });
}
function applyIntervention(who, kind, dir, power, point = null) {
  if (net) {
    send({ type: "action", action: "interfere", kind, dir, power, point });
    return;
  }
  const action = game.interfere(who, kind, dir, power, point);
  if (!action) return;
  animateIntervention(action);
  render();
}
function animateIntervention(action) {
  const player = game.state.players[action.seat];
  board.markAction(action, player.color);
  beep(action.kind);
  toast(
    player.name +
      " · " +
      (action.kind === "wind" ? "吹风" : "振桌") +
      " " +
      Math.round(action.power * 100) +
      "% 已提交",
  );
}
function doMove() {
  if (net) {
    send({ type: "action", action: "move" });
    return;
  }
  if (!game.move()) return;
  board.focus("board");
  render();
  playEvents(game.state.events, () => {
    board.syncPlayers(game.state.players);
    if (game.state.winner !== null) {
      modal = "winner";
      beep("relay");
      render();
    } else schedule(0.9, nextTurn);
  });
}
function playEvents(events, done) {
  let delay = 0;
  for (const e of events) {
    schedule(delay, () => {
      if (e.type === "step") board.placePawn(e.player, e.pos, 0.16);
      if (e.type === "tile") {
        board.tileEffect(e.pos, e.tile);
        toast(
          "第 " +
            e.pos +
            " 格 · " +
            (e.tile === "event"
              ? e.value > 0
                ? "糖果祝福 +1"
                : "酸糖恶作剧 −1"
              : TILE_LABELS[e.tile]),
        );
        beep(e.tile === "retreat" ? "hammer" : "result");
      }
      if (e.type === "skill") showSkill(e.id, e.label);
      if (e.type === "relay") {
        beep("relay");
        toast(
          e.perfect ? "完美接力！下一棒立即再行动" : "接棒成功，换你出发！",
        );
      }
      if (e.type === "encounter") {
        speechText = e.text;
        renderFloating();
        schedule(2, () => {
          speechText = "";
          renderFloating();
        });
      }
    });
    delay +=
      e.type === "step"
        ? 0.18
        : e.type === "tile"
          ? 0.85
          : e.type === "skill"
            ? 1.5
            : 0.1;
  }
  schedule(delay + 0.1, done);
}
function nextTurn() {
  if (!game.next()) return;
  render();
  if (game.state.phase === "skipped") {
    board.focus("board");
    if (game.p.ai) schedule(1.3, nextTurn);
  } else schedule(0.6, ready);
}
function skill(choice) {
  const def = definition(active(game.state.players[game.state.current]));
  if (
    choice === undefined &&
    ["parity", "nudge"].includes(def.effect) &&
    (net ? canSkillRemote() : game.canSkill())
  ) {
    modal = "choice";
    render();
    return;
  }
  choice ??= 1;
  if (net) {
    send({ type: "action", action: "skill", choice });
    return;
  }
  if (!game.skill(choice)) {
    toast(game.state.log[0]);
    render();
    return;
  }
  board.syncPlayers(game.state.players);
  render();
  if (game.state.phase === "ready") board.focus("dice");
}
function startCharge(kind, dir, point = null) {
  if (
    paused ||
    modal ||
    !game ||
    game.state.phase !== "intervene" ||
    game.state.interventions[seat]?.[kind] ||
    charge
  )
    return;
  if (kind === "hammer") {
    point ||= lastPoint || {
      x: game.state.dicePosition.x - 1,
      z: game.state.dicePosition.z,
    };
    lastPoint = point;
  }
  charge = { kind, dir, point, start: clock, seat };
  lastDir = dir;
  lastKind = kind;
  beep();
}
function powerNow() {
  if (!charge) return lastPower;
  const t = ((clock - charge.start) % 0.8) / 0.8;
  return 0.1 + 0.9 * (1 - Math.abs(t * 2 - 1));
}
function releaseCharge() {
  if (!charge) return;
  const { kind, dir, point, seat: who } = charge;
  lastPower = powerNow();
  charge = null;
  board.aimAt(null);
  applyIntervention(who, kind, dir, lastPower, point);
}
function updateMeters() {
  if (!game || game.state.phase !== "intervene") return;
  const left = Math.max(0, deadline - clock),
    power = powerNow(),
    dir = charge?.dir || lastDir,
    kind = charge?.kind || lastKind;
  if ($("#countdown"))
    $("#countdown").innerHTML = left.toFixed(1) + "<small>s</small>";
  if ($("#timer-fill"))
    $("#timer-fill").style.width = (left / windowLength) * 100 + "%";
  if ($("#power-number"))
    $("#power-number").textContent = Math.round(power * 100) + "%";
  if ($("#power-marker")) $("#power-marker").style.left = power * 100 + "%";
  const pl = game.state.players[seat],
    ef = definition(active(pl)).effect,
    boost = ef === (kind === "wind" ? "wind_bonus" : "hammer_bonus") ? 1.25 : 1;
  let actualDir = dir;
  if (kind === "wind" && pl.status.rotate) {
    const dirs = ["up", "right", "down", "left"];
    actualDir = dirs[(dirs.indexOf(dir) + 1) % 4];
  }
  const point = charge?.point ||
    lastPoint || {
      x: game.state.dicePosition.x - 1,
      z: game.state.dicePosition.z,
    };
  const impact =
    kind === "hammer"
      ? hammerImpact(point, game.state.dicePosition, power * boost)
      : {
          effectivePower: Math.min(1, power * boost),
          vector: DIRECTION_VECTORS[actualDir].map(
            (n) => n * Math.min(1, power * boost),
          ),
          lift: 0,
        };
  const actions = [...(game.state.pendingActions || [])];
  if (!game.state.interventions[seat]?.[kind])
    actions.push({ ...impact, seat, kind });
  if ($("#power-direction"))
    $("#power-direction").textContent =
      kind === "hammer"
        ? "落锤距离 " +
          impact.distance.toFixed(1) +
          " · 传力 " +
          Math.round(impact.attenuation * 100) +
          "%"
        : DIRECTIONS[actualDir] + "吹风 · 力度";
  if (charge?.kind === "hammer") board.aimAt(point, pl.color, power);
  if ($("#probabilities"))
    $("#probabilities").innerHTML = combinedPreview(game.state.dice, actions)
      .map(
        (x) =>
          '<div class="prob"><b>' +
          x.face +
          "</b><span>" +
          (x.probability * 100).toFixed(1) +
          "%</span></div>",
      )
      .join("");
}
function exitGame() {
  generation++;
  tasks = [];
  charge = null;
  cutin = null;
  board.clearActions();
  board.setSuspense(false);
  paused = false;
  modal = null;
  game = null;
  shownSkill = 0;
  screen = "menu";
  toastText = "";
  speechText = "";
  if (net) {
    net.socket?.close();
    net = null;
  }
  board.focus("menu");
  render();
}
app.addEventListener("click", (e) => {
  const el = e.target.closest("button");
  if (!el || el.disabled) return;
  beep();
  if (el.dataset.pick) {
    const id = el.dataset.pick;
    if (picks.includes(id)) picks = picks.filter((p) => p !== id);
    else if (picks.length < 4) picks.push(id);
    else toast("四个位置已满，先取消一位再换人");
    render();
    return;
  }
  if (el.dataset.count) {
    playerCount = +el.dataset.count;
    render();
    return;
  }
  if (el.dataset.skin) {
    skinIndex = +el.dataset.skin;
    storage.set("dice-skin", skinIndex);
    board.skin(skins[skinIndex].color);
    render();
    return;
  }
  if (el.dataset.seat) {
    if (charge) releaseCharge();
    seat = +el.dataset.seat;
    render();
    return;
  }
  if (el.dataset.choice) {
    modal = null;
    skill(+el.dataset.choice);
    return;
  }
  const action = el.dataset.action;
  switch (action) {
    case "solo":
      playerCount = 2;
      startDraft("solo");
      break;
    case "local":
      modal = "setup";
      render();
      break;
    case "start-local":
      startDraft("local");
      break;
    case "auto-pick":
      picks = offer.slice(0, 4).map((c) => c.id);
      render();
      break;
    case "confirm-pick":
      if (mode === "online") {
        send({ type: "roster", ids: [...picks] });
        screen = "menu";
        modal = "lobby";
        render();
        break;
      }
      rosters.push([...picks]);
      if (mode === "solo") {
        rosters.push(
          [...offer]
            .reverse()
            .slice(0, 4)
            .map((c) => c.id),
        );
        startGame();
      } else if (++draftTeam === playerCount) startGame();
      else {
        picks = [];
        render();
      }
      break;
    case "help":
      modal = "help";
      if (game && !net) paused = true;
      render();
      break;
    case "skins":
      modal = "skins";
      render();
      break;
    case "close":
    case "resume":
      paused = false;
      if (modal === "lobby" && net) {
        net.socket.close();
        net = null;
      }
      modal = null;
      render();
      break;
    case "sound":
      soundEnabled = !soundEnabled;
      storage.set("dice-sound", soundEnabled ? "1" : "0");
      render();
      break;
    case "pause":
      if (!net) {
        paused = !paused;
        charge = null;
        render();
      }
      break;
    case "menu-confirm":
      modal = "menu-confirm";
      render();
      break;
    case "exit":
      exitGame();
      break;
    case "fullscreen":
      if (document.fullscreenElement) document.exitFullscreen();
      else
        document.documentElement
          .requestFullscreen()
          .catch(() => toast("当前内嵌窗口不支持全屏，请在独立浏览器中打开"));
      break;
    case "pan-mode":
      panMode = !panMode;
      render();
      break;
    case "overview":
      board.focus("board");
      break;
    case "focus":
      if (
        ["ready", "rolling", "intervene", "result"].includes(game.state.phase)
      )
        board.focus("dice");
      else {
        board.focus("board");
        const pawn = board.pawns[game.state.current];
        board.viewTarget.copy(pawn.group.position);
        board.wantDistance = 24;
      }
      break;
    case "zoom-in":
      board.zoom(-5);
      break;
    case "zoom-out":
      board.zoom(5);
      break;
    case "skill":
      if (!net && ["parity", "nudge"].includes(game.def.effect)) {
        modal = "choice";
        render();
      } else skill();
      break;
    case "primary":
      if (game.state.phase === "ready") doRoll();
      else if (game.state.phase === "result") doMove();
      else if (game.state.phase === "skipped") {
        if (net) send({ type: "action", action: "next" });
        else nextTurn();
      } else if (game.state.phase === "ended") {
        modal = "winner";
        render();
      }
      break;
    case "online":
      modal = "online";
      render();
      break;
    case "room-draft":
      mode = "online";
      offer = candidates(net.seed);
      draftTeam = net.seat;
      picks = [...net.players[net.seat].roster];
      screen = "draft";
      modal = null;
      render();
      break;
    case "create-room":
      connectRoom(true);
      break;
    case "join-room":
      connectRoom(false);
      break;
    case "start-room":
      send({ type: "start" });
      break;
  }
});
app.addEventListener("change", (e) => {
  if (e.target.id === "view-select") board.setView(e.target.value);
});
app.addEventListener("pointerdown", (e) => {
  const wind = e.target.closest("[data-wind]"),
    hammer = e.target.closest("[data-hammer]");
  if (wind && !wind.disabled) {
    e.preventDefault();
    startCharge("wind", wind.dataset.wind);
  } else if (hammer && !hammer.disabled) {
    e.preventDefault();
    startCharge("hammer", lastDir);
  }
});
window.addEventListener("pointerup", (e) => {
  if (charge) releaseCharge();
  if (drag) {
    const d = drag;
    drag = null;
    if (
      d.button === 0 &&
      game?.state.phase === "ready" &&
      Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14 &&
      (!net || net.seat === game.state.current) &&
      !game.state.players[game.state.current].ai
    )
      doRoll({ x: e.clientX - d.x, z: e.clientY - d.y });
  }
});
window.addEventListener("pointercancel", () => {
  charge = null;
  drag = null;
});
const canvas = board.renderer.domElement;
canvas.addEventListener("pointerdown", (e) => {
  if (modal || paused) return;
  const point = board.tablePoint(e.clientX, e.clientY);
  const pan =
    e.button === 1 || e.button === 2 || panMode || (!point && e.button === 0);
  drag = {
    x: e.clientX,
    y: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    button: pan ? 1 : e.button,
  };
  canvas.setPointerCapture(e.pointerId);
  if (pan) {
    e.preventDefault();
    return;
  }
  if (e.button === 0 && point && game?.state.phase === "intervene") {
    lastPoint = point;
    const impact = hammerImpact(point, game.state.dicePosition, 0.3);
    startCharge("hammer", impact.dir, point);
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (drag?.button === 1) {
    board.drag(e.clientX - drag.lastX, e.clientY - drag.lastY);
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  }
  if (!drag && game?.state.phase === "intervene" && !panMode) {
    const point = board.tablePoint(e.clientX, e.clientY);
    board.aimAt(point, game.state.players[seat].color, 0.3);
    if (point) {
      lastPoint = point;
      lastKind = "hammer";
    }
  }
  if (!drag && screen === "game" && board.mode !== "dice") {
    const t = board.pick(e.clientX, e.clientY);
    document.querySelector(".tooltip")?.remove();
    if (t) {
      app.insertAdjacentHTML(
        "beforeend",
        `<div class="tooltip" style="left:${Math.min(e.clientX + 12, innerWidth - 190)}px;top:${Math.max(80, e.clientY - 55)}px">第 ${t.index} 格 · ${t.type === "event" ? (t.value > 0 ? "前进 1 格" : "后退 1 格") : TILE_LABELS[t.type]}<small>${[24, 49, 74].includes(t.index) ? "精准到达，完美接力" : "赛道效果提前可见"}</small></div>`,
      );
    }
  }
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (!modal) board.zoom(Math.sign(e.deltaY) * 2.5);
  },
  { passive: false },
);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
const keys = { w: "up", a: "left", s: "down", d: "right" };
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.repeat) return;
  const key = e.key.toLowerCase();
  if (key === "escape" && game && !net) {
    paused = !paused;
    charge = null;
    modal = null;
    render();
  }
  if (modal || paused) return;
  if (keys[key]) {
    if (game?.state.phase === "intervene") {
      e.preventDefault();
      startCharge("wind", keys[key]);
    }
  }
  if (key === "q" && game && !game.state.players[game.state.current].ai)
    skill();
});
window.addEventListener("keyup", (e) => {
  if (keys[e.key.toLowerCase()] && charge?.kind === "wind") releaseCharge();
});
window.addEventListener("blur", () => {
  if (charge) releaseCharge();
  drag = null;
});
function tick(now) {
  const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.1));
  lastTime = now;
  if (!paused) {
    clock += dt;
    const due = tasks.filter((t) => t.at <= clock);
    tasks = tasks.filter((t) => t.at > clock);
    for (const t of due) if (t.generation === generation) t.fn();
    if (charge && clock - charge.start >= 2) releaseCharge();
    updateMeters();
  }
  requestAnimationFrame(tick);
}

function canSkillRemote() {
  const s = game.state,
    p = s.players[s.current],
    c = active(p),
    d = definition(c);
  return (
    !c.used &&
    !c.cooldown &&
    !p.status.silence &&
    ((s.phase === "ready" && ["manual", "before_roll"].includes(d.trigger)) ||
      (s.phase === "result" && d.trigger === "after_roll"))
  );
}
function send(data) {
  if (net?.socket?.readyState === WebSocket.OPEN)
    net.socket.send(JSON.stringify(data));
}
function connectRoom(create) {
  const url = $("#server-url").value.trim(),
    room = $("#room-code").value.trim().toUpperCase();
  if (!/^wss?:\/\//.test(url)) {
    $("#network-status").textContent = "请输入 ws:// 或 wss:// 开头的地址";
    return;
  }
  if (!create && !/^[A-Z0-9]{6}$/.test(room)) {
    $("#network-status").textContent = "请输入六位房间码";
    return;
  }
  storage.set("dice-server", url);
  $("#network-status").textContent = "正在连接…";
  const socket = new WebSocket(url);
  net = { socket, seat: 0 };
  socket.onopen = () => send({ type: create ? "create" : "join", room });
  socket.onerror = () => {
    if ($("#network-status"))
      $("#network-status").textContent =
        "连接失败，请检查服务是否启动、地址及防火墙。";
  };
  socket.onclose = () => {
    if (net?.socket === socket) {
      net = null;
      if (screen === "game") {
        exitGame();
        toast("联机连接已结束，请重新加入房间");
      } else if (modal === "lobby") {
        modal = "online";
        render();
        toast("房间连接已断开");
      }
    }
  };
  socket.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === "error") {
      toast(msg.message);
      return;
    }
    if (msg.type === "lobby") {
      net.room = msg.room;
      net.seat = msg.seat;
      net.seed = msg.seed;
      net.players = msg.players;
      if (screen !== "draft") modal = "lobby";
      render();
      return;
    }
    if (msg.type === "state") receiveState(msg);
  };
}
function receiveState(msg) {
  const previous = game?.state,
    first = screen !== "game";
  if (first) {
    generation++;
    tasks = [];
    screen = "game";
    modal = null;
    board.focus("dice");
  }
  game = { state: msg.state };
  seat = net.seat;
  const s = msg.state;
  if (first) board.setPlayers(s.players);
  if (s.phase === "rolling" && previous?.phase !== "rolling") {
    board.clearActions();
    board.orient(s.dice, 1.65, null, 0, {
      x: s.dicePosition.x / 0.012,
      z: s.dicePosition.z / 0.012,
    });
    board.focus("dice");
    beep("roll");
  }
  if (s.phase === "intervene") {
    if (previous?.phase !== "intervene") {
      windowLength = msg.remaining / 1000;
      deadline = clock + windowLength;
    }
    if (
      s.lastIntervention?.serial !== previous?.lastIntervention?.serial &&
      s.lastIntervention
    )
      animateIntervention(s.lastIntervention);
  }
  if (s.phase === "settling" && previous?.phase !== "settling")
    presentResolution(s);

  if (s.phase === "moving" || s.phase === "ended") {
    if (previous?.phase !== s.phase) {
      board.focus("board");
      playEvents(s.events, () => board.syncPlayers(s.players));
    }
  } else if (s.phase === "ready") {
    board.syncPlayers(s.players);
    board.focus("dice");
  }
  if (s.phase === "ended") {
    modal = "winner";
    beep("relay");
  }
  render();
}

render();
requestAnimationFrame(tick);
