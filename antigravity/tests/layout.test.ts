import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROL_TOOLTIPS } from "../src/data/tooltips.ts";
import { CONTROL_PLACEMENTS, DIM, KEY_SPECS } from "../src/model/layout.ts";
import { SPEC_BY_ID } from "../src/state/specs.ts";

describe("Physical Layout, Specs & Brand Compliance", () => {
  it("contains 44 keys (26 white, 18 black) inside keybed bounds", () => {
    expect(KEY_SPECS.length).toBe(44);
    const white = KEY_SPECS.filter((k) => !k.isBlack);
    const black = KEY_SPECS.filter((k) => k.isBlack);
    expect(white.length).toBe(26);
    expect(black.length).toBe(18);
    expect(KEY_SPECS[0].midi).toBe(48);
    expect(KEY_SPECS[43].midi).toBe(91);

    for (const k of KEY_SPECS) {
      expect(k.x).toBeGreaterThanOrEqual(DIM.KEY_X0);
      expect(k.x).toBeLessThanOrEqual(DIM.KEY_X1);
    }
  });

  it("keeps every 3D panel and side-strip control collision-free", () => {
    const panelCtrls = CONTROL_PLACEMENTS.filter((c) => c.space === "panel");
    const sideCtrls = CONTROL_PLACEMENTS.filter((c) => c.space === "side");

    for (const c of panelCtrls) {
      expect(c.x).toBeGreaterThan(-DIM.PANEL_W / 2 + 0.008);
      expect(c.x).toBeLessThan(DIM.PANEL_W / 2 - 0.008);
      expect(c.pos).toBeGreaterThan(0.015);
      expect(c.pos).toBeLessThan(DIM.PANEL_D - 0.015);
    }

    const checkCollisions = (items: typeof CONTROL_PLACEMENTS) => {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          const dist = Math.hypot(a.x - b.x, a.pos - b.pos);
          const minClear = (a.radius ?? 0.0055) + (b.radius ?? 0.0055) + 0.004;
          expect(
            dist,
            `Controls ${a.id} and ${b.id} too close (${dist.toFixed(4)}m)`,
          ).toBeGreaterThanOrEqual(minClear);
        }
      }
    };

    checkCollisions(panelCtrls);
    checkCollisions(sideCtrls);
  });

  it("ensures every 3D placement has a ControlSpec and Learning Tooltip", () => {
    for (const p of CONTROL_PLACEMENTS) {
      expect(SPEC_BY_ID[p.id]).toBeDefined();
      expect(CONTROL_TOOLTIPS[p.id]).toBeDefined();
    }
  });

  it("contains zero third-party trademark strings anywhere in antigravity source", () => {
    const forbidden = new RegExp(["mo", "og"].join(""), "i");
    const rootDir = path.resolve(__dirname, "..");

    const walk = (dir: string): string[] => {
      const files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walk(full));
        else if (/\.(ts|js|html|css|md)$/i.test(entry.name)) files.push(full);
      }
      return files;
    };

    for (const file of walk(rootDir)) {
      const content = fs.readFileSync(file, "utf8");
      expect(forbidden.test(content), `Trademark token found in ${file}`).toBe(false);
    }
  });
});
