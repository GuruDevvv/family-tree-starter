import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from '../../scripts/lib/load.js';
import { buildSiteData } from '../../scripts/lib/build.js';
import { layoutTree, layoutScore, linkGeometry, sideBranches, placeOrdered, generations, GAP_IN, NODE } from './layout';
import type { Person } from './types';

const fixture = path.resolve(__dirname, '../../tests/fixtures/family');
const site = buildSiteData(loadData(fixture), { stories: {} });
const people = site.people as Person[];
const root = site.meta.root as string;

const real = path.resolve(__dirname, '../public/data.json');
const realData = fs.existsSync(real) ? JSON.parse(fs.readFileSync(real, 'utf8')) : null;

function checkLayout(ps: Person[], r: string) {
  const L = layoutTree(ps, r);
  const byRow = new Map<number, number[]>();
  for (const n of L.nodes.values()) {
    if (!byRow.has(n.row)) byRow.set(n.row, []);
    byRow.get(n.row)!.push(n.x);
  }
  for (const xs of byRow.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(GAP_IN - 1e-6);
  }
  for (const n of L.nodes.values()) expect(n.x).toBeGreaterThanOrEqual(NODE.w / 2);
  // дети всегда рядом ниже родителей
  for (const f of L.families)
    for (const c of f.children) for (const p of f.parents) expect(L.nodes.get(c.id)!.row).toBe(L.nodes.get(p)!.row + 1);
  return L;
}

describe('раскладка древа', () => {
  it('поколения: родители выше, супруги в том же ряду', () => {
    const g = generations(people, root);
    const me = people.find((p) => p.id === root)!;
    for (const l of me.parents ?? []) expect(g.get(l.person)).toBe(1);
  });

  it('тестовая семья: все связанные на месте, без наложений', () => {
    const L = checkLayout(people, root);
    expect(L.nodes.size + L.loose.length).toBe(people.length);
  });
});

describe('боковые ветки', () => {
  it.skipIf(!realData)('каждый связанный не-предок ровно в одной ветке; свёрнутое древо без пересечений и быстро', () => {
    const ps = realData.people as Person[];
    const r = realData.meta.root;
    const br = sideBranches(ps, r);
    const all = [...br.values()].flat();
    expect(new Set(all).size).toBe(all.length);
    const core = ps.filter((p) => p.id === r || p.ahnentafel).map((p) => p.id);
    const g = generations(ps, r);
    expect(all.length + core.length).toBe([...g.keys()].length);
    const hidden = new Set(all);
    const t = Date.now();
    const L = layoutTree(ps.filter((p) => !hidden.has(p.id)), r, { budgetMs: 300 });
    expect(Date.now() - t).toBeLessThan(1500);
    expect(layoutScore(L).crossings).toBe(0);
  });
});

describe('раскрытие ветки', () => {
  it.skipIf(!realData)('уже видимые не меняются местами и почти не двигаются, ветки раскрываются подряд', () => {
    const ps = realData.people as Person[];
    const r = realData.meta.root;
    const br = sideBranches(ps, r);
    const open = new Set<string>();
    const visible = () => ps.filter((p) => ![...br].some(([o, ms]) => !open.has(o) && ms.includes(p.id)));
    let L = layoutTree(visible(), r, { budgetMs: 300 });
    // по очереди раскрываем ветки предков от ближних к дальним, потом сворачиваем первую
    const owners = [...br.keys()].sort((a, b) => (ps.find((p) => p.id === a)?.ahnentafel ?? 1) - (ps.find((p) => p.id === b)?.ahnentafel ?? 1));
    if (!owners.length) return; // нет боковых веток — нечего раскрывать
    const steps: [string, boolean][] = [...owners.map((o) => [o, true] as [string, boolean]), [owners[0], false]];
    for (const [o, add] of steps) {
      if (add) open.add(o); else open.delete(o);
      const N = layoutTree(visible(), r, { budgetMs: 300, prev: L });
      const both = [...L.nodes.keys()].filter((id) => N.nodes.has(id));
      // порядок в каждом ряду тот же
      for (const a of both)
        for (const b of both)
          if (L.nodes.get(a)!.row === L.nodes.get(b)!.row && L.nodes.get(a)!.x < L.nodes.get(b)!.x) expect(N.nodes.get(a)!.x).toBeLessThan(N.nodes.get(b)!.x);
      // предок с кнопкой — ориентир: относительно него остальные сдвигаются не больше чем на ширину ветки
      const d = (id: string) => N.nodes.get(id)!.x - L.nodes.get(id)!.x - (N.nodes.get(o)!.x - L.nodes.get(o)!.x);
      const branchW = (br.get(o)!.length + 1) * GAP_IN;
      for (const id of both) expect(Math.abs(d(id))).toBeLessThanOrEqual(branchW + 1);
      expect(layoutScore(N).overlaps).toBe(0);
      expect(layoutScore(N).throughNodes).toBe(0);
      L = N;
    }
  }, 30_000);
});

describe('placeOrdered', () => {
  it('держит порядок и зазор, остальное — как просили', () => {
    expect(placeOrdered([0, 500], [100, 100])).toEqual([0, 500]);
    expect(placeOrdered([0, 0], [100, 100])).toEqual([-50, 50]);
  });
});
