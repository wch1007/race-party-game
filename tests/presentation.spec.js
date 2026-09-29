import { test, expect } from "@playwright/test";
test("cinematic skill, four cameras, fullscreen, real felt hits and collective reveal", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.addInitScript(() => {
    Date.now = () => 20260930;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "本地派对" }).click();
  await page.getByRole("button", { name: "2 人", exact: true }).click();
  await page.getByRole("button", { name: "开始选角" }).click();
  for (const id of ["choco_anchor", "sprint", "cloud_timer", "double_cup"])
    await page.locator(`[data-pick="${id}"]`).click();
  await page.getByRole("button", { name: "确认，下一队" }).click();
  await page.getByRole("button", { name: "帮我组队" }).click();
  await page.getByRole("button", { name: "出发，去赛场" }).click();
  await page.waitForTimeout(1300);
  await page.locator('[data-action="skill"]').click();
  await expect(page.locator(".skill-cutin")).toBeVisible();
  await page.waitForFunction(
    () => document.querySelector(".skill-cutin img")?.naturalWidth > 0,
  );
  await page.waitForTimeout(350);
  await page.screenshot({ path: "tests/skill-cutin.png" });
  await expect(page.locator(".skill-cutin")).toHaveCount(0, { timeout: 4000 });
  await page.getByRole("button", { name: "俯瞰赛场" }).click();
  for (const v of ["top", "cinema", "reverse", "isometric"]) {
    await page.getByLabel("切换视角").selectOption(v);
    await expect(page.getByLabel("切换视角")).toHaveValue(v);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1300);
  await page.screenshot({ path: "tests/festival.png" });
  await page.getByRole("button", { name: "切换全屏" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.getByRole("button", { name: "切换全屏" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await page.getByRole("button", { name: "拖拽视野 关" }).click();
  await page.mouse.move(720, 440);
  await page.mouse.down();
  await page.mouse.move(790, 470, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "拖拽视野 开" })).toBeVisible();
  await page.getByRole("button", { name: "拖拽视野 开" }).click();
  await page.getByRole("button", { name: "回到骰盘", exact: true }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "甩出骰子" }).click();
  await expect(page.getByText("抢骰面时刻")).toBeVisible();
  const original = await page.locator("#top-face").textContent();
  await page.mouse.move(640, 430);
  await page.mouse.down();
  await page.waitForTimeout(160);
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "本队振桌已使用" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "P2", exact: true }).click();
  await page.mouse.move(880, 490);
  await page.mouse.down();
  await page.waitForTimeout(190);
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "本队振桌已使用" }),
  ).toBeDisabled();
  await expect(page.locator(".action-card")).toHaveCount(2);
  await expect(page.locator(".action-card").nth(0)).toContainText("距离");
  await expect(page.locator(".action-card").nth(1)).toContainText("距离");
  await expect(page.locator("#top-face")).toHaveText(original);
  await expect(page.locator(".showdown-banner")).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "tests/showdown.png" });
  await expect(page.getByRole("button", { name: "确认，向前跑" })).toBeEnabled({
    timeout: 7000,
  });
  expect(errors).toEqual([]);
});
