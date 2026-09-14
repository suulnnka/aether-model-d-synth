const { chromium } = require("playwright-core");
const EXEC = "C:/Users/thhid/.agent-browser/browsers/chrome-153.0.8010.36/chrome.exe";
(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true, args: ["--use-angle=default"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto("http://localhost:5173/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector(".aether-guide-card button")?.click());
  await page.evaluate(() => { const h = document.querySelector(".aether-soundhint"); if (h) h.hidden = true; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "screenshot-3d.png" });
  // 按下琴键截图
  await page.keyboard.down("a");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "screenshot-playing.png" });
  await page.keyboard.up("a");
  // 2D
  await page.keyboard.press("v");
  await page.waitForTimeout(1300);
  await page.screenshot({ path: "screenshot-2d.png" });
  await browser.close();
})();
