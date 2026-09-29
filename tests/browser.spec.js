import { test, expect } from "@playwright/test";
import { createPartyServer } from "../server.js";
test("real browser: draft, drag throw, both interventions, pause, movement, camera and skins", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "tests/menu.png" });
  await page.getByRole("button", { name: "骰子工坊" }).click();
  await page.getByRole("button", { name: "薄荷汽水" }).click();
  await expect(page.getByRole("button", { name: "薄荷汽水" })).toHaveClass(
    /selected/,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "游戏规则" }).click();
  await expect(page.getByText("四位搭档，共跑一圈")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "本地派对" }).click();
  await page.getByRole("button", { name: "2 人", exact: true }).click();
  await page.getByRole("button", { name: "开始选角" }).click();
  await expect(page.locator(".char-card")).toHaveCount(10);
  await page.screenshot({ path: "tests/draft.png" });
  await page.getByRole("button", { name: "帮我组队" }).click();
  await page.getByRole("button", { name: "确认，下一队" }).click();
  await page.getByRole("button", { name: "帮我组队" }).click();
  await page.getByRole("button", { name: "出发，去赛场" }).click();
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: "甩出骰子" }).click();
  await expect(page.getByText("抢骰面时刻")).toBeVisible();
  await page.keyboard.down("d");
  await page.waitForTimeout(130);
  await page.keyboard.up("d");
  await expect(page.getByRole("button", { name: "向右吹风" })).toBeDisabled();
  const hammer = page.getByRole("button", { name: "按住蓄力，松手振桌" });
  await hammer.hover();
  await page.mouse.down();
  await page.waitForTimeout(170);
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "本队振桌已使用" }),
  ).toBeDisabled();
  await page.screenshot({ path: "tests/intervention.png" });
  await page.getByRole("button", { name: "暂停游戏" }).click();
  await expect(page.getByText("比赛和干预计时都已暂停。")).toBeVisible();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "继续比赛" }).click();
  await expect(page.getByRole("button", { name: "确认，向前跑" })).toBeEnabled({
    timeout: 12000,
  });
  await page.getByRole("button", { name: "确认，向前跑" }).click();
  await expect(page.locator(".team-row.active .team-title")).toContainText(
    "薄荷队",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "俯瞰赛场" }).click();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: "tests/board.png" });
  await page.getByRole("button", { name: "回到骰盘", exact: true }).click();
  await page.waitForTimeout(900);
  await page.mouse.move(730, 425);
  await page.mouse.down();
  await page.mouse.move(790, 340, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText("抢骰面时刻")).toBeVisible({ timeout: 5000 });
  expect(errors).toEqual([]);
});
test("portrait layout: draft and play controls fit inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "单人练习" }).click();
  await page.getByRole("button", { name: "帮我组队" }).click();
  await page.getByRole("button", { name: "出发，去赛场" }).click();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "甩出骰子" }).click();
  await expect(page.getByText("抢骰面时刻")).toBeVisible();
  await page.screenshot({ path: "tests/mobile.png" });
  for (const selector of [".bottom-bar", ".intervention", ".scoreboard"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  }
});
test("two real browser clients: room creation, personal roster, synchronized throw and guest wind", async ({
  browser,
}) => {
  const server = createPartyServer({ port: 0, host: "127.0.0.1" });
  await new Promise((r) => server.wss.once("listening", r));
  const url = `ws://127.0.0.1:${server.wss.address().port}`;
  const ctxA = await browser.newContext(),
    ctxB = await browser.newContext(),
    a = await ctxA.newPage(),
    b = await ctxB.newPage();
  const errors = [];
  a.on("pageerror", (e) => errors.push(e.message));
  b.on("pageerror", (e) => errors.push(e.message));
  try {
    await a.goto("http://localhost:5173");
    await b.goto("http://localhost:5173");
    await a.getByRole("button", { name: "联机房间" }).click();
    await a.locator("#server-url").fill(url);
    await a.getByRole("button", { name: "创建房间" }).click();
    await expect(a.locator(".modal h2")).toContainText("房间");
    const code = (await a.locator(".modal h2").textContent()).split(" ")[1];
    await b.getByRole("button", { name: "联机房间" }).click();
    await b.locator("#server-url").fill(url);
    await b.locator("#room-code").fill(code);
    await b.getByRole("button", { name: "加入", exact: true }).click();
    await expect(b.getByText("已加入", { exact: true })).toBeVisible();
    await a.getByRole("button", { name: "挑选我的四位搭档" }).click();
    await expect(a.locator(".char-card")).toHaveCount(10);
    await a.getByRole("button", { name: "帮我组队" }).click();
    await a.getByRole("button", { name: "保存阵容" }).click();
    await a.getByRole("button", { name: "人齐了，开始比赛" }).click();
    await expect(a.getByRole("button", { name: "甩出骰子" })).toBeEnabled();
    await expect(b.getByRole("button", { name: "甩出骰子" })).toBeDisabled();
    await a.getByRole("button", { name: "甩出骰子" }).click();
    await expect(b.getByText("抢骰面时刻")).toBeVisible();
    await b.keyboard.down("a");
    await b.waitForTimeout(180);
    await b.keyboard.up("a");
    await expect(b.getByRole("button", { name: "向左吹风" })).toBeDisabled();
    await expect(a.locator("#top-face")).toHaveText(
      await b.locator("#top-face").textContent(),
    );
    await expect(a.getByRole("button", { name: "确认，向前跑" })).toBeEnabled({
      timeout: 12000,
    });
    await a.getByRole("button", { name: "确认，向前跑" }).click();
    await expect(b.getByRole("button", { name: "甩出骰子" })).toBeEnabled({
      timeout: 15000,
    });
    expect(errors).toEqual([]);
  } finally {
    await ctxA.close();
    await ctxB.close();
    server.close();
  }
});
