import { WebSocketServer, WebSocket } from "ws";
import { randomBytes } from "node:crypto";
import { Game, candidates, TEAM_NAMES } from "./src/game.js";

// The server owns randomness, timers, rules, and intervention budgets.
export function createPartyServer({
  port = Number(process.env.PORT) || 8787,
  host = process.env.HOST || "0.0.0.0",
  rollMs = 1700,
  settleMs = 1650,
  showdownMs = 1250,
} = {}) {
  const wss = new WebSocketServer({ port, host, maxPayload: 4096 }),
    rooms = new Map();
  const send = (ws, data) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };
  function later(room, ms, fn) {
    const timer = setTimeout(() => {
      room.timers.delete(timer);
      if (rooms.has(room.code)) fn();
    }, ms);
    room.timers.add(timer);
  }
  function lobby(room) {
    room.peers.forEach((ws, seat) =>
      send(ws, {
        type: "lobby",
        room: room.code,
        seat,
        seed: room.seed,
        players: room.peers.map((_, i) => ({
          name: TEAM_NAMES[i],
          roster: room.rosters[i],
        })),
      }),
    );
  }
  function broadcast(room) {
    const s = room.game.state;
    room.peers.forEach((ws) =>
      send(ws, {
        type: "state",
        state: s,
        remaining: Math.max(0, (room.deadline || 0) - Date.now()),
      }),
    );
  }
  function ai(room) {
    const g = room.game;
    if (!g || g.state.winner !== null) return;
    if (g.p.ai)
      later(room, 800, () => {
        if (!g.p.ai) return;
        if (g.canSkill()) g.skill();
        if (g.state.phase === "ready") roll(room);
        else if (g.state.phase === "result") move(room);
        else if (g.state.phase === "skipped") {
          g.next();
          broadcast(room);
          ai(room);
        }
      });
  }
  function roll(room, gesture) {
    const g = room.game;
    if (!g.roll(gesture)) return;
    broadcast(room);
    later(room, rollMs, () => {
      g.openIntervention();
      room.deadline = Date.now() + g.windowSeconds() * 1000;
      broadcast(room);
      later(room, g.windowSeconds() * 1000, () => {
        g.prepareResolution();
        broadcast(room);
        later(room, showdownMs, () => {
          g.state.phase = "settling";
          broadcast(room);
          later(room, settleMs, () => {
            g.settle();
            broadcast(room);
            ai(room);
          });
        });
      });
    });
  }
  function move(room) {
    const g = room.game;
    if (!g.move()) return;
    broadcast(room);
    if (g.state.winner !== null) return;
    const time =
      g.state.events.reduce(
        (sum, e) =>
          sum +
          (e.type === "step"
            ? 180
            : e.type === "tile"
              ? 850
              : e.type === "skill"
                ? 1500
                : 100),
        0,
      ) + 1100;
    later(room, time, () => {
      g.next();
      broadcast(room);
      ai(room);
    });
  }
  function destroy(room) {
    for (const t of room.timers) clearTimeout(t);
    rooms.delete(room.code);
    room.peers.forEach((ws) => {
      if (ws?.readyState === WebSocket.OPEN) {
        send(ws, { type: "error", message: "房主已离开，房间结束" });
        ws.close(1000, "Room closed");
      }
    });
  }
  wss.on("connection", (ws) => {
    let room = null,
      seat = -1,
      last = 0;
    ws.on("message", (raw) => {
      try {
        if (Date.now() - last < 15) return;
        last = Date.now();
        const m = JSON.parse(raw);
        if (!m || typeof m !== "object") return;
        if (m.type === "create" && !room) {
          if (rooms.size >= 100)
            return send(ws, { type: "error", message: "房间已满，请稍后再试" });
          const code = randomBytes(3).toString("hex").toUpperCase(),
            seed = Date.now();
          room = {
            code,
            seed,
            peers: [ws],
            rosters: [
              candidates(seed)
                .slice(0, 4)
                .map((c) => c.id),
            ],
            timers: new Set(),
          };
          rooms.set(code, room);
          seat = 0;
          lobby(room);
          return;
        }
        if (m.type === "join" && !room) {
          const found = rooms.get(m.room);
          if (!found || found.game || found.peers.length >= 4)
            return send(ws, {
              type: "error",
              message: "房间不存在、已开赛或已满",
            });
          room = found;
          seat = room.peers.length;
          room.peers.push(ws);
          room.rosters.push(
            candidates(room.seed)
              .slice(seat, seat + 4)
              .map((c) => c.id),
          );
          lobby(room);
          return;
        }
        if (!room) return;
        seat = room.peers.indexOf(ws);
        if (m.type === "roster" && !room.game) {
          const pool = candidates(room.seed).map((c) => c.id);
          if (
            !Array.isArray(m.ids) ||
            m.ids.length !== 4 ||
            new Set(m.ids).size !== 4 ||
            m.ids.some((id) => !pool.includes(id))
          )
            return send(ws, {
              type: "error",
              message: "请选择候选池中的 4 位不同角色",
            });
          room.rosters[seat] = m.ids;
          lobby(room);
          return;
        }
        if (
          m.type === "start" &&
          seat === 0 &&
          !room.game &&
          room.peers.length >= 2
        ) {
          room.game = new Game(room.rosters, { seed: room.seed });
          broadcast(room);
          return;
        }
        if (m.type !== "action" || !room.game) return;
        const g = room.game;
        if (g.state.winner !== null) return;
        if (m.action === "interfere") {
          if (Date.now() > room.deadline) return;
          if (g.interfere(seat, m.kind, m.dir, m.power, m.point))
            broadcast(room);
          return;
        }
        if (g.state.current !== seat) return;
        if (m.action === "roll") {
          const gesture = m.gesture;
          if (
            gesture &&
            (!Number.isFinite(gesture.x) || !Number.isFinite(gesture.z))
          )
            return;
          roll(room, gesture);
        }
        if (
          m.action === "skill" &&
          g.skill(m.choice === -1 ? -1 : m.choice === 0 ? 0 : 1)
        )
          broadcast(room);
        if (m.action === "move") move(room);
        if (m.action === "next" && g.state.phase === "skipped") {
          g.next();
          broadcast(room);
          ai(room);
        }
      } catch {
        send(ws, { type: "error", message: "操作无效，请重试" });
      }
    });
    ws.on("close", () => {
      if (!room || !rooms.has(room.code)) return;
      seat = room.peers.indexOf(ws);
      if (seat === 0) {
        destroy(room);
        return;
      }
      if (!room.game) {
        room.peers.splice(seat, 1);
        room.rosters.splice(seat, 1);
        lobby(room);
      } else {
        room.peers[seat] = null;
        room.game.state.players[seat].ai = true;
        room.game.note(`${TEAM_NAMES[seat]} 离线，AI 接棒`);
        broadcast(room);
        ai(room);
      }
    });
    ws.on("error", () => {});
  });
  wss.on("close", () => {
    for (const room of rooms.values())
      for (const timer of room.timers) clearTimeout(timer);
  });
  return {
    wss,
    rooms,
    close: () => {
      for (const room of [...rooms.values()]) destroy(room);
      wss.close();
    },
  };
}
if (
  process.argv[1] &&
  new URL(import.meta.url).pathname.endsWith("/server.js") &&
  process.argv[1].replaceAll("\\", "/").endsWith("/server.js")
) {
  const server = createPartyServer();
  server.wss.on("listening", () =>
    console.log(
      `Dice & Dash room server listening on ${server.wss.address().port}`,
    ),
  );
}
