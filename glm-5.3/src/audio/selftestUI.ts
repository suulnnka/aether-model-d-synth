/** ?selftest 结果面板 */

export type SelfTestCase = { name: string; pass: boolean; detail: string };

export function mountSelfTestUI(run: () => Promise<SelfTestCase[]>): void {
  const panel = document.createElement("div");
  panel.className = "selftest";
  panel.innerHTML = `<h2>离线渲染自检(OfflineAudioContext)</h2><div id="st-body">运行中…</div>`;
  document.body.appendChild(panel);
  run()
    .then((cases) => {
      const okCount = cases.filter((c) => c.pass).length;
      const rows = cases
        .map(
          (c) =>
            `<div class="case ${c.pass ? "ok" : "fail"}"><span>${c.pass ? "✓" : "✗"} ${c.name}</span><span class="detail">${c.detail}</span></div>`
        )
        .join("");
      panel.querySelector("#st-body")!.innerHTML =
        `<div style="margin-bottom:8px">${okCount}/${cases.length} 通过</div>` + rows;
    })
    .catch((e) => {
      panel.querySelector("#st-body")!.textContent = `自检失败:${String(e)}`;
    });
}
