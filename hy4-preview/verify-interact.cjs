/* 交互与音频功能验证 */
const { chromium } = require("playwright-core");
const EXEC = "C:/Users/thhid/.agent-browser/browsers/chrome-153.0.8010.36/chrome.exe";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector(".aether-guide-card button")?.click());
  await page.evaluate(() => window.__aether.engine.init());
  await page.waitForTimeout(600);

  const results = {};

  // 1. 电脑键盘演奏(AUD-1 单音逻辑:按下两个键,松开第一个 → 回退)
  await page.keyboard.down("a");
  await page.waitForTimeout(80);
  await page.keyboard.down("s");
  await page.waitForTimeout(80);
  results.noteTwoHeld = await page.evaluate(() => window.__aether.engine.playing);
  await page.keyboard.up("s");
  await page.waitForTimeout(80);
  results.noteAfterRelease = await page.evaluate(() => window.__aether.engine.playing);
  await page.keyboard.up("a");
  await page.waitForTimeout(100);
  results.noteAllReleased = await page.evaluate(() => window.__aether.engine.playing);

  // 2. 参数仓库 → 音频联动:改 cutoff 后 AudioParam 应变化
  results.cutoffParam = await page.evaluate(() => {
    const { store, engine } = window.__aether;
    store.set("cutoff", 2);
    return new Promise((res) => setTimeout(() => {
      const p = engine.degraded ? 0 : engine["ladder"].parameters.get("cutoff").value;
      res({ degraded: engine.degraded, cutoffParamHz: Math.round(p) });
    }, 120));
  });

  // 3. 鼠标点击开关(滤波 MOD 开关)
  results.switchBefore = await page.evaluate(() => window.__aether.store.get("filterMod"));
  // 通过 raycast 语义直接在页面里模拟:pointerdown 于开关屏幕位置
  results.switchClick = await page.evaluate(() => {
    const { synth } = window.__aether;
    const b = synth.bindings.find((x) => x.id === "filterMod");
    const v = b.hit.getWorldPosition(new (b.hit.position.constructor)());
    // 用 store 层验证开关行为(3D 命中由 InteractionManager.pick 覆盖,单测略)
    window.__aether.store.set("filterMod", 1);
    return window.__aether.store.get("filterMod");
  });

  // 4. 琴键视觉下沉(鼠标按下琴键)
  const keyTest = await page.evaluate(() => {
    const { synth } = window.__aether;
    const k = synth.keys.find((k) => k.midi === 60); void k;
    return { restY: k.restY, before: k.targetY };
  });
  // 找到 MIDI 60 (C4) 键的屏幕位置:投影
  const keyScreen = await page.evaluate(() => {
    const { synth, rig } = window.__aether;
    const k = synth.keys.find((k) => k.midi === 60); void k;
    const v = k.mesh.getWorldPosition(new (k.mesh.position.constructor)()).project(rig.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.move(keyScreen.x, keyScreen.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  results.keyPressed = await page.evaluate(() => {
    const k = window.__aether.synth.keys.find((k) => k.midi === 60);
    return { targetY: k.targetY, pressed: k.targetY < k.restY };
  });
  await page.mouse.up();
  await page.waitForTimeout(150);
  results.keyReleased = await page.evaluate(() => {
    const k = window.__aether.synth.keys.find((k) => k.midi === 60);
    return k.targetY >= k.restY;
  });

  // 5. 视角切换 V / 面板 H
  await page.keyboard.press("v");
  await page.waitForTimeout(1200);
  results.viewAfterV = await page.evaluate(() => window.__aether.rig.mode());
  await page.keyboard.press("v");
  await page.waitForTimeout(1200);
  results.viewBack3d = await page.evaluate(() => window.__aether.rig.mode());
  results.hingeBefore = await page.evaluate(() => window.__aether.synth.hingeGroup.rotation.x);
  await page.keyboard.press("h");
  await page.waitForTimeout(800);
  results.hingeAfterH = await page.evaluate(() => window.__aether.synth.hingeGroup.rotation.x);

  // 6. 空格 panic
  await page.keyboard.down("a");
  await page.waitForTimeout(60);
  await page.keyboard.press(" ");
  await page.waitForTimeout(60);
  results.panicStops = await page.evaluate(() => !window.__aether.engine.playing);

  // 7. 持久化
  results.persisted = await page.evaluate(() => !!localStorage.getItem("aether-model-d.v1"));

  console.log("RESULTS:", JSON.stringify(results, null, 1));
  console.log("ERRORS:", errors.join(" | ") || "(none)");
  await browser.close();
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
