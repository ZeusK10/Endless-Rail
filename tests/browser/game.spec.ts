import { test, expect } from "@playwright/test";

test("journey, sliding settings, mode and audio controls", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#start-screen")).toBeVisible();
  await page.getByRole("button", { name: /Start journey/i }).click();
  await expect(page.locator("#game-hud")).toBeVisible();
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.locator("#settings-drawer")).toHaveClass(/is-open/);

  await page.locator("#train-type-select").selectOption("electric");
  await expect(page.locator("#train-type-select")).toHaveValue("electric");
  await page.locator('[data-mode="cruise"]').click();
  await expect(page.locator('[data-mode="cruise"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator("#quality-select").selectOption("0.7");
  await page.locator("#volume-rails").evaluate((slider: HTMLInputElement) => {
    slider.value = "45";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#volume-rails")).toHaveValue("45");
  await page.locator("#derail-toggle").check();
  await page.locator("#weather-toggle").uncheck();
  await page.locator("#day-length").selectOption("8");
  await expect(page.locator("#day-length")).toHaveValue("8");
  await page.locator("#time-of-day").evaluate((slider: HTMLInputElement) => {
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#time-value")).toHaveText("00:00");

  await page.getByRole("button", { name: "Close settings" }).last().click();
  await expect(page.locator("#settings-drawer")).not.toHaveClass(/is-open/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-screen")).toBeVisible();
  await page.getByRole("button", { name: "Resume journey" }).click();
  await expect(page.locator("#pause-screen")).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("free camera and keyboard horn remain available", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.locator("#play-button").click();
  await page.keyboard.press("h");
  await page.locator("#settings-button").click();
  await page.locator("#drawer-freecam-button").click();
  await expect(page.locator("#free-controls")).not.toHaveAttribute("hidden", "");
  await page.keyboard.press("v");
  await expect(page.locator("#free-controls")).toHaveAttribute("hidden", "");
  expect(errors).toEqual([]);
});

test("top and bottom gameplay panels collapse independently without losing settings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.locator("#play-button").click();
  const mainBounds = await page.locator("#hud-main").boundingBox();
  expect(mainBounds?.width).toBeLessThan(430);
  await expect(page.locator(".hud-readout")).toBeVisible();
  await page.locator("#hud-collapse").click();
  await expect(page.locator("#hud-main")).toHaveAttribute("hidden", "");
  await expect(page.locator("#hud-collapsed")).not.toHaveAttribute("hidden", "");
  await expect(page.locator("#compact-settings")).toHaveAttribute("aria-label", "Open settings");
  await expect(page.locator("#compact-settings svg")).toBeVisible();
  await page.locator("#compact-settings").click();
  await expect(page.locator("#settings-drawer")).toHaveClass(/is-open/);
  await page.locator("#settings-close").click();
  await page.locator("#hud-expand").click();
  await expect(page.locator("#hud-main")).not.toHaveAttribute("hidden", "");
  await page.locator("#bottom-controls-toggle").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#bottom-controls-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#touch-controls")).toHaveAttribute("hidden", "");
  await page.locator("#bottom-controls-toggle").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#bottom-controls-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#touch-controls")).not.toHaveAttribute("hidden", "");
  expect(errors).toEqual([]);
});

test("tablet-sized touch viewport keeps controls recoverable and free-look anchored", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: /Start journey/i }).click();
  await page.locator("#hud-collapse").click();
  await expect(page.locator("#hud-collapsed")).toBeVisible();
  await expect(page.locator("#hud-expand")).toHaveAttribute("aria-label", "Expand driving HUD");
  await expect(page.locator("#hud-expand svg")).toBeVisible();
  await page.locator("#bottom-controls-toggle").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#bottom-controls-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.locator("#hud-expand").click();
  await page.locator("#bottom-controls-toggle").evaluate((button: HTMLButtonElement) => button.click());
  await page.locator("#settings-button").click();
  await page.locator("#drawer-freecam-button").click();
  await expect(page.locator("#free-controls")).not.toHaveAttribute("hidden", "");
  await expect(page.locator("[data-control='flyLeft']")).toHaveAttribute("aria-label", "Look left");
  // A resized desktop browser still reports a fine pointer: its touch pad is
  // intentionally CSS-hidden, so exit via the shared keyboard/controller path.
  await page.keyboard.press("v");
  await expect(page.locator("#free-controls")).toHaveAttribute("hidden", "");
  expect(errors).toEqual([]);
});
