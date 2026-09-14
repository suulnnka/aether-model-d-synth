/* 用 playwright-core 验证页面渲染(强制点击,不依赖 actionability) */
const { chromium } = require("playwright-core");

const EXEC = "C:/Users/thhid/.agent-browser/browsers/chrome-153.0.8010.36/chrome.exe";

(async () => {
  const browser = await chromium.launch({
    executablePath: EXEC,
    headless: true,
    args: ["--use-angle=default", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[console.error] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

  await page.goto("http://localhost:5173/", { waitUntil: "load" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "shot-3d.png" });

  // 激活声音 + 关闭引导(强制 DOM click,绕过遮挡检测)
  await page.mouse.click(640, 550);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelector(".aether-guide-card button")?.click();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shot-guide-closed.png" });

  // 电脑键盘演奏
  await page.keyboard.down("a");
  await page.waitForTimeout(500);
  await page.keyboard.up("a");
  await page.waitForTimeout(200);
  await page.screenshot({ path: "shot-playing.png" });

  // 切 2D 视角(强制点击右上第一个按钮)
  await page.evaluate(() => {
    document.querySelector(".aether-topright button")?.click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "shot-2d.png" });

  const info = await page.evaluate(() => ({
    canvas: !!document.querySelector("canvas.webgl"),
    cw: document.querySelector("canvas.webgl")?.width,
    ch: document.querySelector("canvas.webgl")?.height,
    btns: document.querySelectorAll(".aether-btn").length,
    localStorage: !!localStorage.getItem("aether-model-d.v1"),
  }));
  console.log("INFO:", JSON.stringify(info));
  console.log("ERRORS:", errors.slice(0, 12).join("\n") || "(none)");
  await browser.close();
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
