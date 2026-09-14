/* 近景检查面板正反面 */
const { chromium } = require("playwright-core");
const EXEC = "C:/Users/thhid/.agent-browser/browsers/chrome-153.0.8010.36/chrome.exe";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true, args: ["--use-angle=default"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto("http://localhost:5173/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    document.querySelector(".aether-guide-card button")?.click();
  });
  await page.waitForTimeout(300);
  // 近景:正对面板
  await page.evaluate(() => {
    const { rig } = window.__aether;
    rig.camera.position.set(0, 0.32, 0.5);
    rig.controls.target.set(0, 0.14, 0.03);
    rig.controls.update();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "shot-panel-close.png" });
  await browser.close();
})();
