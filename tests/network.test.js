import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createPartyServer } from "../server.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function wait(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", on);
      reject(Error("Network message timeout"));
    }, 7000);
    function on(raw) {
      const m = JSON.parse(raw);
      if (predicate(m)) {
        clearTimeout(timer);
        ws.off("message", on);
        resolve(m);
      }
    }
    ws.on("message", on);
  });
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r) => ws.once("open", r));
  return ws;
}
test("room authority: non-owner cannot roll, all seats can interfere only once, peers stay in sync", async () => {
  const server = createPartyServer({
    port: 0,
    host: "127.0.0.1",
    rollMs: 40,
    settleMs: 20,
  });
  await new Promise((r) => server.wss.once("listening", r));
  const url = `ws://127.0.0.1:${server.wss.address().port}`,
    a = await connect(url),
    b = await connect(url);
  try {
    let pending = wait(a, (m) => m.type === "lobby");
    a.send(JSON.stringify({ type: "create" }));
    const room = (await pending).room;
    pending = wait(b, (m) => m.type === "lobby");
    b.send(JSON.stringify({ type: "join", room }));
    const lobby = await pending;
    assert.equal(lobby.seat, 1);
    await sleep(25);
    pending = wait(b, (m) => m.type === "state");
    a.send(JSON.stringify({ type: "start" }));
    assert.equal((await pending).state.phase, "ready");
    await sleep(25);
    b.send(JSON.stringify({ type: "action", action: "roll" }));
    await sleep(70);
    assert.equal(server.rooms.get(room).game.state.phase, "ready");
    pending = wait(
      b,
      (m) => m.type === "state" && m.state.phase === "intervene",
    );
    a.send(JSON.stringify({ type: "action", action: "roll" }));
    await pending;
    pending = wait(a, (m) => m.state?.interventions[1].wind);
    b.send(
      JSON.stringify({
        type: "action",
        action: "interfere",
        kind: "wind",
        dir: "right",
        power: 0.3,
      }),
    );
    const state = (await pending).state;
    assert.equal(state.interventions[1].wind, true);
    const serial = state.lastIntervention.serial;
    await sleep(25);
    b.send(
      JSON.stringify({
        type: "action",
        action: "interfere",
        kind: "wind",
        dir: "right",
        power: 1,
      }),
    );
    await sleep(50);
    assert.equal(
      server.rooms.get(room).game.state.lastIntervention.serial,
      serial,
    );
    b.close();
    await sleep(80);
    assert.equal(server.rooms.get(room).game.state.players[1].ai, true);
  } finally {
    a.close();
    b.close();
    server.close();
  }
});
