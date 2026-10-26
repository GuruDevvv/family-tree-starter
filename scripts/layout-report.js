// Отчёт о раскладке древа: оценка и список конкретных пересечений/наложений с именами.
// node scripts/layout-report.js [--fresh]  (--fresh — пересчитать раскладку, иначе взять из site/public/data.json)
import fs from 'node:fs';
import { layoutTree, layoutScore, linkGeometry } from '../site/src/layout.ts';

const data = JSON.parse(fs.readFileSync(new URL('../site/public/data.json', import.meta.url), 'utf8'));
const name = new Map(data.people.map((p) => [p.id, p.name.full]));
const t0 = Date.now();
const L = process.argv.includes('--fresh')
  ? layoutTree(data.people, data.meta.root)
  : { ...data.layout, nodes: new Map(data.layout.nodes.map((n) => [n.id, n])) };
const ms = Date.now() - t0;
console.log('оценка', layoutScore(L), process.argv.includes('--fresh') ? `${ms} мс` : '');
const { segs } = linkGeometry(L);
const who = (s) => `${(s.p ?? []).map((i) => name.get(i)).join('+')} → ${(s.c ?? []).map((i) => name.get(i)).join(', ')}`;
const H = segs.filter((s) => Math.abs(s.y1 - s.y2) < 0.5 && Math.abs(s.x1 - s.x2) > 0.5);
const V = segs.filter((s) => Math.abs(s.x1 - s.x2) < 0.5 && Math.abs(s.y1 - s.y2) > 0.5);
const inside = (v, a, b) => v > Math.min(a, b) + 0.5 && v < Math.max(a, b) - 0.5;
for (const h of H) for (const v of V)
  if (v.group !== h.group && inside(v.x1, h.x1, h.x2) && inside(h.y1, v.y1, v.y2)) console.log('✗ пересечение:', who(h), ' ×  ', who(v));
for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
  const a = H[i], b = H[j];
  if (a.group === b.group || Math.abs(a.y1 - b.y1) > 0.5) continue;
  if (Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)) > 1) console.log('≡ наложение:', who(a), ' ||  ', who(b));
}
// длинные перекладины: дети далеко от родителей
for (const f of L.families) {
  const sx = f.parents.reduce((a, p) => a + L.nodes.get(p).x, 0) / f.parents.length;
  const far = Math.max(...f.children.map((c) => Math.abs(L.nodes.get(c.id).x - sx)));
  if (far > 600) console.log('↔ далеко от родителей:', f.parents.map((p) => name.get(p)).join('+'), '→', f.children.map((c) => name.get(c.id)).join(', '), Math.round(far));
}
