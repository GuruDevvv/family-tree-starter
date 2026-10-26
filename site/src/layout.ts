// Раскладка древа: кто в каком ряду и на какой высоте, без отрисовки.
// Ряд = поколение относительно владельца (старшие сверху). Супруги одного ряда образуют «семейный блок»,
// порядок блоков подбирается так, чтобы линии родитель–ребёнок меньше пересекались,
// затем блоки сдвигаются, чтобы пары стояли над своими детьми.
import type { Person } from './types';

export const NODE = { w: 210, ovalW: 98, ovalH: 114, meW: 110, meH: 126 };
export const GAP_IN = 200; // между центрами супругов: подписи до 194 px не наезжают друг на друга
export const GAP_OUT = 205; // между центрами соседних блоков
export const ROW_H = 230;

export interface PlacedNode {
  id: string;
  x: number; // центр
  y: number; // верх овала
  row: number;
}

export interface Family {
  parents: string[];
  children: { id: string; hypothesis: boolean }[];
}

export interface Couple {
  a: string;
  b: string;
  hypothesis: boolean;
}

export interface TreeLayout {
  nodes: Map<string, PlacedNode>;
  couples: Couple[];
  families: Family[];
  rows: number;
  width: number;
  height: number;
  /** люди, не связанные с владельцем ни одной известной связью */
  loose: string[];
}

type Unit = string[];

/** Поколение каждого связанного с корнем человека: родители +1, дети −1, супруги — то же. */
export function generations(people: Person[], root: string): Map<string, number> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const gen = new Map<string, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    const p = byId.get(id);
    if (!p) continue;
    const g = gen.get(id)!;
    const next: [string | undefined, number][] = [
      ...(p.parents ?? []).map((l) => [l.person, g + 1] as [string, number]),
      ...(p.children ?? []).map((l) => [l.person, g - 1] as [string, number]),
      ...(p.spouses ?? []).map((l) => [l.person, g] as [string, number]),
    ];
    for (const [other, og] of next) {
      if (!other || gen.has(other) || !byId.has(other)) continue;
      gen.set(other, og);
      queue.push(other);
    }
  }
  return gen;
}

/**
 * Боковые ветки: всех, кто не на прямой линии владельца (он сам и его предки), приписываем ближайшему по связям предку.
 * Ключ — предок, значение — люди его ветки (братья, сёстры, их семьи, другие браки). Ветку можно свернуть целиком.
 */
export function sideBranches(people: Person[], root: string): Map<string, string[]> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const core = people.filter((p) => p.id === root || p.ahnentafel).sort((a, b) => (a.ahnentafel ?? 1) - (b.ahnentafel ?? 1));
  const coreIds = new Set(core.map((p) => p.id));
  const owner = new Map<string, string>(core.map((p) => [p.id, p.id]));
  const queue = core.map((p) => p.id); // ближние предки первыми: при равенстве ветка достаётся младшему поколению
  while (queue.length) {
    const id = queue.shift()!;
    const p = byId.get(id);
    if (!p) continue;
    for (const l of [...(p.parents ?? []), ...(p.children ?? []), ...(p.spouses ?? [])]) {
      if (owner.has(l.person) || !byId.has(l.person)) continue;
      owner.set(l.person, owner.get(id)!);
      queue.push(l.person);
    }
  }
  const out = new Map<string, string[]>();
  for (const [id, o] of owner) if (!coreIds.has(id)) out.set(o, [...(out.get(o) ?? []), id]);
  return out;
}

/**
 * opts.prev — раскладка, которая сейчас на экране (раскрыли или свернули ветку). Тогда уже видимые люди
 * сохраняют порядок в ряду и почти не двигаются: их только раздвигают, чтобы освободить место.
 * Новые блоки встают рядом со своей роднёй, и подбирается место только для них.
 */
export function layoutTree(people: Person[], root: string, opts: { budgetMs?: number; prev?: TreeLayout } = {}): TreeLayout {
  const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : Infinity;
  const prevX = opts.prev ? new Map([...opts.prev.nodes.values()].map((n) => [n.id, n.x])) : null;
  const byId = new Map(people.map((p) => [p.id, p]));
  const gen = generations(people, root);
  const maxGen = Math.max(...gen.values());
  const rowOf = (id: string) => maxGen - gen.get(id)!;
  const rowCount = maxGen - Math.min(...gen.values()) + 1;

  const parentsOf = (id: string) => (byId.get(id)?.parents ?? []).filter((l) => gen.has(l.person) && rowOf(l.person) === rowOf(id) - 1);
  const childrenOf = (id: string) => (byId.get(id)?.children ?? []).filter((l) => gen.has(l.person) && rowOf(l.person) === rowOf(id) + 1);
  const spousesOf = (id: string) => (byId.get(id)?.spouses ?? []).filter((l) => gen.has(l.person) && rowOf(l.person) === rowOf(id));

  // --- прямые предки стоят по номерам: в каждой паре муж слева, род мужа левее рода жены.
  // Перестановки ниже этот порядок не ломают — иначе родители бабушки уезжают на сторону деда.
  const ahn = (id: string) => (id === root ? 1 : byId.get(id)?.ahnentafel ?? undefined);
  const rank = (u: Unit) => Math.min(...u.map((m) => ahn(m) ?? Infinity));
  const isCore = (u: Unit) => rank(u) < Infinity;
  const fixedPair = (u: Unit) => u.filter((m) => ahn(m) !== undefined).length > 1;
  function orient(u: Unit): Unit {
    const cs = u.filter((m) => ahn(m) !== undefined);
    return cs.length > 1 && ahn(cs[0])! > ahn(cs[cs.length - 1])! ? [...u].reverse() : u;
  }
  const coreOk = (row: Unit[]) => { let last = 0; for (const u of row) if (isCore(u)) { if (rank(u) < last) return false; last = rank(u); } return true; };
  const coreOrder = (row: Unit[]) => {
    const slots = row.flatMap((u, i) => (isCore(u) ? [i] : []));
    const sorted = slots.map((i) => row[i]).sort((a, b) => rank(a) - rank(b));
    slots.forEach((i, k) => { row[i] = sorted[k]; });
  };

  // --- семейные блоки: связные группы супругов в ряду, выстроенные цепочкой
  const rows: Unit[][] = Array.from({ length: rowCount }, () => []);
  const seen = new Set<string>();
  const ids = [...gen.keys()].sort();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const s of spousesOf(c)) if (!seen.has(s.person)) { seen.add(s.person); stack.push(s.person); }
    }
    rows[rowOf(id)].push(orient(chain(comp, (x) => spousesOf(x).map((s) => s.person), byId)));
  }

  // --- начальный порядок: предки по номеру (папина линия слева), остальные — следом
  // не-предки стартуют рядом со «своим» предком (чья это боковая ветка) — иначе все начинают посередине
  // и при коротком подборе в браузере братья деда оказываются на стороне другой бабушки
  const ownerOf = new Map<string, string>();
  for (const [o, ms] of sideBranches(people, root)) for (const m of ms) ownerOf.set(m, o);
  const seed = (id: string) => {
    const n = byId.get(id)?.ahnentafel ?? byId.get(ownerOf.get(id) ?? '')?.ahnentafel;
    if (!n) return 0.5;
    const g = Math.floor(Math.log2(n));
    return (n - 2 ** g + 0.5) / 2 ** g;
  };
  // --- стабильный режим: место в ряду — по прежней картинке; у новых — по уже известной родне
  const known = new Map<string, number>(prevX ?? []);
  const isNew = (u: Unit) => !!prevX && u.every((m) => !prevX.has(m));
  // ключ блока хранится по людям: при развороте блок становится новым массивом
  const keyOf = new Map<string, number>();
  const unitKey = (u: Unit) => keyOf.get(u[0]) ?? 0;
  if (prevX) {
    const linked = (id: string) => {
      const p = byId.get(id);
      return [...(p?.parents ?? []), ...(p?.children ?? []), ...(p?.spouses ?? [])].map((l) => l.person).filter((o) => gen.has(o));
    };
    // волнами от видимых: каждый новый берёт среднее места уже размещённой родни
    for (let changed = true; changed; ) {
      changed = false;
      for (const id of gen.keys()) {
        if (known.has(id)) continue;
        const xs = linked(id).filter((o) => known.has(o)).map((o) => known.get(o)!);
        if (xs.length) { known.set(id, avg(xs)); changed = true; }
      }
    }
    for (let r = 0; r < rows.length; r++)
      rows[r] = rows[r].map((u) => {
        // супруги в блоке стоят как стояли
        const olds = u.filter((m) => prevX.has(m));
        return olds.length > 1 && !fixedPair(u) && prevX.get(olds[0])! > prevX.get(olds[olds.length - 1])! ? [...u].reverse() : u;
      });
    for (const row of rows) {
      for (const u of row) {
        const olds = u.filter((m) => prevX.has(m));
        const xs = (olds.length ? olds : u).map((m) => known.get(m)).filter((v): v is number => v !== undefined);
        let key = xs.length ? avg(xs) : 0;
        // брат или сестра уже на экране — встаём вплотную к нему, с той стороны, где нет его супруга
        const sib = olds.length ? undefined : u.flatMap((m) => parentsOf(m).flatMap((l) => childrenOf(l.person).map((c) => c.person))).find((c) => prevX.has(c));
        if (sib) {
          const su = row.find((v) => v.includes(sib))!;
          const spouseRight = su.some((v) => v !== sib && prevX.has(v) && prevX.get(v)! > prevX.get(sib)!);
          key = prevX.get(sib)! + (spouseRight ? -1 : 1);
        }
        for (const m of u) keyOf.set(m, key);
      }
      // при равенстве новый блок — за старым: соседей своего предка он не расталкивает
      const order = () => { row.sort((a, b) => unitKey(a) - unitKey(b) || Number(isNew(a)) - Number(isNew(b))); coreOrder(row); };
      order();
      // чужая ветка не вклинивается в группу братьев и сестёр, а встаёт с её ближнего края
      const parentSet = (u: Unit) => new Set(u.flatMap((m) => parentsOf(m).map((l) => l.person)));
      const kin = (a: Unit, b: Unit) => { const pa = parentSet(a); return [...parentSet(b)].some((p) => pa.has(p)); };
      const olds = row.filter((u) => !isNew(u));
      for (const u of row.filter(isNew)) {
        const k = unitKey(u);
        const j = olds.findIndex((o) => unitKey(o) > k);
        if (j <= 0 || !kin(olds[j - 1], olds[j]) || kin(u, olds[j - 1]) || kin(u, olds[j])) continue;
        let lo = j - 1, hi = j;
        while (lo > 0 && kin(olds[lo - 1], olds[lo])) lo--;
        while (hi + 1 < olds.length && kin(olds[hi], olds[hi + 1])) hi++;
        const left = unitKey(olds[lo]), right = unitKey(olds[hi]);
        const nk = k - left < right - k ? left - 0.5 : right + 0.5;
        for (const m of u) keyOf.set(m, nk);
      }
      order();
    }
  } else for (const row of rows) { row.sort((a, b) => avg(a.map(seed)) - avg(b.map(seed))); coreOrder(row); }

  // --- уменьшаем пересечения: проходы по барицентрам вверх и вниз, лучший вариант запоминаем
  const pos = new Map<string, number>();
  const index = () => rows.forEach((row) => { let i = 0; for (const u of row) for (const m of u) pos.set(m, i++); });
  const crossings = () => {
    index();
    let total = 0;
    for (let r = 1; r < rowCount; r++) {
      const edges: [number, number][] = [];
      for (const u of rows[r]) for (const m of u) for (const l of parentsOf(m)) edges.push([pos.get(l.person)!, pos.get(m)!]);
      for (let i = 0; i < edges.length; i++)
        for (let j = i + 1; j < edges.length; j++)
          if ((edges[i][0] - edges[j][0]) * (edges[i][1] - edges[j][1]) < 0) total++;
    }
    return total;
  };
  const neighbours = (m: string, dir: -1 | 1) => (dir < 0 ? parentsOf(m) : childrenOf(m)).map((l) => pos.get(l.person)!);
  const sortRow = (r: number, dir: -1 | 1) => {
    index();
    const key = new Map<Unit, number>();
    rows[r].forEach((u, i) => {
      // нет связей в эту сторону — держимся связей в другую (братья и сёстры без детей остаются рядом)
      const ns = u.flatMap((m) => neighbours(m, dir));
      const other = u.flatMap((m) => neighbours(m, dir === -1 ? 1 : -1));
      key.set(u, (ns.length ? avg(ns) : other.length ? avg(other) : avg(u.map((m) => pos.get(m)!))) + i * 1e-3);
    });
    rows[r].sort((a, b) => key.get(a)! - key.get(b)!);
    coreOrder(rows[r]);
  };
  let best = snapshot(rows);
  let bestCross = prevX ? 0 : crossings(); // в стабильном режиме общих перестановок нет
  for (let pass = 0; pass < 12 && bestCross > 0; pass++) {
    for (let r = 1; r < rowCount; r++) sortRow(r, -1);
    for (let r = rowCount - 2; r >= 0; r--) sortRow(r, 1);
    const c = crossings();
    if (c < bestCross) { bestCross = c; best = snapshot(rows); }
  }
  restore(rows, best);
  // дожимаем: меняем соседние блоки местами, пока пересечений становится меньше
  for (let improved = true; improved && bestCross > 0; ) {
    improved = false;
    for (const row of rows)
      for (let i = 0; i + 1 < row.length; i++) {
        [row[i], row[i + 1]] = [row[i + 1], row[i]];
        const c = coreOk(row) ? crossings() : Infinity;
        if (c < bestCross) { bestCross = c; improved = true; }
        else [row[i], row[i + 1]] = [row[i + 1], row[i]];
      }
  }
  // разворот блоков: оставляем, если пересечений становится меньше
  for (const row of prevX ? [] : rows)
    for (let i = 0; i < row.length; i++) {
      if (row[i].length < 2 || fixedPair(row[i])) continue;
      const before = crossings();
      row[i] = [...row[i]].reverse();
      if (crossings() >= before) row[i] = [...row[i]].reverse();
    }

  // --- координаты: блоки тянутся к родителям и детям, порядок и зазоры сохраняются
  const place = (iters = 300): TreeLayout => {
  const x = new Map<string, number>();
  const unitW = (u: Unit) => (u.length - 1) * GAP_IN;
  for (const row of rows) { let cur = 0; for (const u of row) { u.forEach((m, k) => x.set(m, cur + k * GAP_IN)); cur += unitW(u) + GAP_OUT; } }
  if (prevX)
    for (const row of rows) {
      const lefts = placeOrdered(row.map((u) => unitKey(u) - unitW(u) / 2), row.map((u) => unitW(u) + GAP_OUT));
      row.forEach((u, i) => u.forEach((m, k) => x.set(m, lefts[i] + k * GAP_IN)));
    }

  const parentMid = (m: string) => { const ps = parentsOf(m); return ps.length ? avg(ps.map((l) => x.get(l.person)!)) : null; };
  // слабая тяга к соседям по ряду: без неё «мостик» из одной пары растаскивает стороны древа далеко друг от друга
  const PACK = 0.15;
  const ANCHOR = 6;
  const SIDE = prevX ? 24 : 4; // при раскрытии ветки род должен уйти вслед за потомком, а не держаться за старое место
  const desiredLeft = (u: Unit, i: number, row: Unit[]) => {
    const wants: number[] = [];
    const packs: number[] = [];
    if (i > 0) packs.push(x.get(row[i - 1][0])! + unitW(row[i - 1]) + GAP_OUT);
    if (i + 1 < row.length) packs.push(x.get(row[i + 1][0])! - unitW(u) - GAP_OUT);
    u.forEach((m, k) => {
      const pm = parentMid(m);
      if (pm !== null) wants.push(pm - k * GAP_IN);
    });
    // дети каждой пары блока: их середина должна оказаться под серединой родителей
    for (const fam of familiesOfUnit(u)) {
      const kids = fam.children.map((c) => x.get(c)!);
      const mid = (Math.min(...kids) + Math.max(...kids)) / 2;
      const parentsMidOffset = avg(fam.parents.map((p) => u.indexOf(p) * GAP_IN));
      wants.push(mid - parentsMidOffset);
      // родители прямого предка: род мужа не правее него, род жены не левее неё
      const heir = fam.children.find((c) => (ahn(c) ?? 0) > 1);
      if (heir && fam.parents.every((p) => ahn(p) !== undefined)) {
        const hx = x.get(heir)!;
        const side = ahn(heir)! % 2 ? Math.max(mid, hx) : Math.min(mid, hx);
        for (let s = 0; s < SIDE; s++) wants.push(side - parentsMidOffset);
      }
    }
    // уже видимые держатся за своё прежнее место сильнее, чем за родню
    let anchor = 0, anchorW = 0;
    if (prevX) u.forEach((m, k) => { if (prevX.has(m)) { anchor += ANCHOR * (prevX.get(m)! - k * GAP_IN); anchorW += ANCHOR; } });
    if (!wants.length && !anchorW) return packs.length ? avg(packs) : x.get(u[0])!;
    return (wants.reduce((a, v) => a + v, 0) + PACK * packs.reduce((a, v) => a + v, 0) + anchor) / (wants.length + PACK * packs.length + anchorW);
  };
  const familiesOfUnit = (u: Unit) => {
    const fams = new Map<string, { parents: string[]; children: string[] }>();
    for (const m of u)
      for (const c of childrenOf(m)) {
        const ps = parentsOf(c.person).map((l) => l.person).filter((p) => u.includes(p)).sort();
        const key = ps.join('+');
        if (!fams.has(key)) fams.set(key, { parents: ps, children: [] });
        const f = fams.get(key)!;
        if (!f.children.includes(c.person)) f.children.push(c.person);
      }
    return [...fams.values()];
  };
  // итерации до успокоения: как только за проход никто не сдвинулся больше чем на полточки — хватит
  for (let it = 0; it < iters; it++) {
    const order = it % 2 ? [...rows.keys()].reverse() : [...rows.keys()];
    let moved = 0;
    for (const r of order) {
      const row = rows[r];
      if (!row.length) continue;
      const lefts = placeOrdered(row.map((u, i) => desiredLeft(u, i, row)), row.map((u) => unitW(u) + GAP_OUT));
      row.forEach((u, i) => u.forEach((m, k) => {
        const nx = lefts[i] + k * GAP_IN;
        moved = Math.max(moved, Math.abs(nx - (x.get(m) ?? nx)));
        x.set(m, nx);
      }));
    }
    if (moved < 0.5 && it > 10) break;
  }

  const minX = Math.min(...x.values());
  const pad = NODE.w / 2 + 20;
  const nodes = new Map<string, PlacedNode>();
  for (const id of gen.keys()) nodes.set(id, { id, x: x.get(id)! - minX + pad, y: rowOf(id) * ROW_H + 20, row: rowOf(id) });

  // --- пары и семьи для линий
  const couples: Couple[] = [];
  for (const row of rows)
    for (const u of row)
      for (let k = 0; k + 1 < u.length; k++) {
        const link = spousesOf(u[k]).find((s) => s.person === u[k + 1]);
        couples.push({ a: u[k], b: u[k + 1], hypothesis: link?.status === 'hypothesis' });
      }
  const families = new Map<string, Family>();
  for (const id of gen.keys()) {
    const ps = parentsOf(id);
    if (!ps.length) continue;
    const key = ps.map((l) => l.person).sort().join('+');
    if (!families.has(key)) families.set(key, { parents: ps.map((l) => l.person).sort(), children: [] });
    families.get(key)!.children.push({ id, hypothesis: ps.some((l) => l.status !== 'confirmed') });
  }

  const width = Math.max(...[...nodes.values()].map((n) => n.x)) + pad;
  return {
    nodes,
    couples,
    families: [...families.values()],
    rows: rowCount,
    width,
    height: rowCount * ROW_H,
    loose: people.map((p) => p.id).filter((id) => !gen.has(id)),
  };
  };

  // --- доводка по настоящей картинке: перестановки соседних блоков и разворот пар, пока оценка падает.
  // Порядок по номерам в ряду не видит длинных перекладин и линий через полдрева — эта оценка видит.
  const cost = (L: TreeLayout) => {
    const s = layoutScore(L);
    return s.crossings * 4000 + s.overlaps * 2000 + s.throughNodes * 8000 + s.hLength + (prevX ? 3 * drift(L) : 0);
  };
  // насколько уехали уже видимые люди (общий сдвиг всей картинки не в счёт)
  const drift = (L: TreeLayout) => {
    const d = [...prevX!].filter(([id]) => L.nodes.has(id)).map(([id, px]) => L.nodes.get(id)!.x - px);
    if (!d.length) return 0;
    const shift = [...d].sort((a, b) => a - b)[d.length >> 1];
    return d.reduce((a, v) => a + Math.abs(v - shift), 0);
  };
  const movable = (u: Unit) => !prevX || isNew(u);
  // в поиске координаты считаются грубо (быстро), окончательная картинка — полным расчётом
  const SEARCH_ITERS = 40;
  let bestCost = cost(place(SEARCH_ITERS));
  for (let pass = 0, improved = true; improved && pass < 6 && Date.now() < deadline; pass++) {
    improved = false;
    for (const row of rows) {
      if (Date.now() > deadline) break; // в браузере доводка ограничена по времени
      for (let i = 0; i + 1 < row.length && Date.now() < deadline; i++) {
        if (!movable(row[i]) || !movable(row[i + 1])) continue; // новые меняются местами только между собой
        [row[i], row[i + 1]] = [row[i + 1], row[i]];
        const c = coreOk(row) ? cost(place(SEARCH_ITERS)) : Infinity;
        if (c < bestCost - 1) { bestCost = c; improved = true; }
        else [row[i], row[i + 1]] = [row[i + 1], row[i]];
      }
      // перенос блока на другое место ряда (соседних обменов мало, когда семья застряла за чужой)
      // в стабильном режиме далеко не переносим: ветка остаётся рядом со своим предком
      for (let i = 0; i < row.length && Date.now() < deadline && !prevX; i++) {
        const [u] = row.splice(i, 1);
        let bestJ = i;
        for (let j = 0; j <= row.length; j++) {
          if (j === i) continue;
          row.splice(j, 0, u);
          const c = coreOk(row) ? cost(place(SEARCH_ITERS)) : Infinity;
          if (c < bestCost - 1) { bestCost = c; bestJ = j; improved = true; }
          row.splice(j, 1);
        }
        row.splice(bestJ, 0, u);
      }
      for (let i = 0; i < row.length && Date.now() < deadline; i++) {
        if (row[i].length < 2 || !movable(row[i]) || fixedPair(row[i])) continue;
        row[i] = [...row[i]].reverse();
        const c = cost(place(SEARCH_ITERS));
        if (c < bestCost - 1) { bestCost = c; improved = true; }
        else row[i] = [...row[i]].reverse();
      }
    }
  }
  return place();
}

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** чья это линия: пара «c…» или семья «f…» — пересечения внутри одной группы не считаются */
  group: string;
  hypothesis: boolean;
  /** кого соединяет: родители (или пара) и дети этой линии — для подсветки ветки выбранного человека */
  p?: string[];
  c?: string[];
  /** у горизонтали: где её пересекает чужая вертикаль — там рисуем разрыв, чтобы линия читалась «под» другой */
  gaps?: number[];
}

export interface LinkGeometry {
  segs: Seg[];
  /** веточка под парой — там, где от неё идёт линия к детям */
  sprigs: { x: number; y: number }[];
}

/**
 * Линии древа: пары — горизонталью между овалами; семья — вниз от середины пары (или от одного родителя)
 * к своей перекладине и от неё к каждому ребёнку. Перекладины семей одного ряда раскладываются по уровням
 * так, чтобы не накладывались друг на друга (жадная раскраска отрезков).
 */
export function linkGeometry(L: TreeLayout): LinkGeometry {
  const N = L.nodes;
  const mid = (id: string) => N.get(id)!.y + NODE.ovalH / 2;
  const segs: Seg[] = [];
  const sprigs: { x: number; y: number }[] = [];

  L.couples.forEach((c, i) => {
    const a = N.get(c.a)!, b = N.get(c.b)!;
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    const y = mid(c.a);
    segs.push({ x1: l.x + NODE.ovalW / 2 + 3, y1: y, x2: r.x - NODE.ovalW / 2 - 3, y2: y, group: `c${i}`, hypothesis: c.hypothesis, p: [c.a, c.b], c: [] });
  });

  const fams = L.families.map((f, i) => {
    const ps = f.parents.map((p) => N.get(p)!);
    const sx = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const sy = ps.length > 1 ? mid(f.parents[0]) : ps[0].y + NODE.ovalH + 4;
    const kids = f.children.map((c) => ({ ...c, n: N.get(c.id)! }));
    const xs = [sx, ...kids.map((k) => k.n.x)];
    return { i, f, sx, sy, kids, top: Math.min(...kids.map((k) => k.n.y)), lo: Math.min(...xs), hi: Math.max(...xs), level: 0 };
  });
  // уровни перекладин: в каждом ряду детей отрезки, которые перекрываются, уходят на разную высоту
  const byTop = new Map<number, typeof fams>();
  for (const f of fams) byTop.set(f.top, [...(byTop.get(f.top) ?? []), f]);
  for (const group of byTop.values()) {
    const ends: number[] = []; // правый край последнего отрезка на каждом уровне
    for (const f of [...group].sort((a, b) => a.lo - b.lo || a.hi - b.hi)) {
      let lv = ends.findIndex((e) => e < f.lo - 24);
      if (lv < 0) { lv = ends.length; ends.push(f.hi); } else ends[lv] = f.hi;
      f.level = lv;
    }
  }
  for (const fm of fams) {
    // уровни разведены заметно: при 12 px две параллельные перекладины читались как одна толстая линия
    const bus = fm.top - 14 - fm.level * 18;
    const g = `f${fm.i}`;
    const p = fm.f.parents, all = fm.kids.map((k) => k.id);
    segs.push({ x1: fm.sx, y1: fm.sy, x2: fm.sx, y2: bus, group: g, hypothesis: false, p, c: all });
    if (fm.hi - fm.lo > 0.5) segs.push({ x1: fm.lo, y1: bus, x2: fm.hi, y2: bus, group: g, hypothesis: fm.kids.every((k) => k.hypothesis), p, c: all });
    for (const k of fm.kids) segs.push({ x1: k.n.x, y1: bus, x2: k.n.x, y2: k.n.y - 3, group: g, hypothesis: k.hypothesis, p, c: [k.id] });
    if (fm.f.parents.length > 1) sprigs.push({ x: fm.sx, y: fm.sy });
  }
  for (const h of segs) {
    if (Math.abs(h.y1 - h.y2) > 0.5) continue;
    const xs = segs.filter((v) => v.group !== h.group && Math.abs(v.x1 - v.x2) < 0.5 && crosses(h, v)).map((v) => v.x1);
    if (xs.length) h.gaps = xs.sort((a, b) => a - b);
  }
  return { segs, sprigs };
}

/**
 * Насколько древо читается: пересечения линий разных групп, наложения перекладин, линии сквозь чужие овалы
 * и общая длина горизонталей. Нужна, чтобы сравнивать раскладки числом, а не на глаз.
 */
export function layoutScore(L: TreeLayout) {
  const { segs } = linkGeometry(L);
  const H = segs.filter((s) => Math.abs(s.y1 - s.y2) < 0.5 && Math.abs(s.x1 - s.x2) > 0.5);
  const V = segs.filter((s) => Math.abs(s.x1 - s.x2) < 0.5 && Math.abs(s.y1 - s.y2) > 0.5);
  let crossings = 0, overlaps = 0, throughNodes = 0, hLength = 0;
  for (const h of H) {
    hLength += Math.abs(h.x2 - h.x1);
    for (const v of V) if (v.group !== h.group && crosses(h, v)) crossings++;
  }
  for (let i = 0; i < H.length; i++)
    for (let j = i + 1; j < H.length; j++) {
      const a = H[i], b = H[j];
      if (a.group === b.group || Math.abs(a.y1 - b.y1) > 0.5) continue;
      if (Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)) > 1) overlaps++;
    }
  const boxes = [...L.nodes.values()].map((n) => ({ id: n.id, x1: n.x - NODE.ovalW / 2, x2: n.x + NODE.ovalW / 2, y1: n.y, y2: n.y + NODE.ovalH }));
  for (const s of segs)
    for (const b of boxes) {
      const sx1 = Math.min(s.x1, s.x2), sx2 = Math.max(s.x1, s.x2), sy1 = Math.min(s.y1, s.y2), sy2 = Math.max(s.y1, s.y2);
      if (sx2 > b.x1 + 2 && sx1 < b.x2 - 2 && sy2 > b.y1 + 2 && sy1 < b.y2 - 2) throughNodes++;
    }
  return { crossings, overlaps, throughNodes, hLength: Math.round(hLength), width: Math.round(L.width) };
}

/** Вертикаль v проходит сквозь горизонталь h (не касается концом). */
function crosses(h: Seg, v: Seg) {
  const inside = (p: number, a: number, b: number) => p > Math.min(a, b) + 0.5 && p < Math.max(a, b) - 0.5;
  return inside(v.x1, h.x1, h.x2) && inside(h.y1, v.y1, v.y2);
}

/** Группа супругов цепочкой: тот, у кого два супруга, — в середине. При равенстве мужчина слева. */
function chain(comp: string[], spouses: (id: string) => string[], byId: Map<string, Person>): Unit {
  if (comp.length === 1) return comp;
  const sexRank = (id: string) => (byId.get(id)?.sex === 'M' ? 0 : 1);
  const ends = comp.filter((id) => spouses(id).filter((s) => comp.includes(s)).length <= 1).sort((a, b) => sexRank(a) - sexRank(b));
  const start = ends[0] ?? comp[0];
  const out = [start];
  const used = new Set(out);
  for (;;) {
    const next = spouses(out[out.length - 1]).find((s) => comp.includes(s) && !used.has(s));
    if (!next) break;
    out.push(next);
    used.add(next);
  }
  for (const id of comp) if (!used.has(id)) out.push(id);
  return out;
}

/**
 * Расставить отрезки по прямой в заданном порядке как можно ближе к желаемым точкам,
 * не ближе step[i] друг к другу (метод соседних нарушителей, минимум суммы квадратов отклонений).
 */
export function placeOrdered(desired: number[], step: number[]): number[] {
  const offset: number[] = [];
  let acc = 0;
  for (let i = 0; i < desired.length; i++) { offset.push(acc); acc += step[i]; }
  const blocks: { sum: number; n: number }[] = [];
  for (let i = 0; i < desired.length; i++) {
    blocks.push({ sum: desired[i] - offset[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!;
      blocks[blocks.length - 1].sum += b.sum;
      blocks[blocks.length - 1].n += b.n;
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.sum / b.n + offset[out.length]);
  return out;
}

function avg(a: number[]) {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function snapshot(rows: Unit[][]) {
  return rows.map((r) => r.map((u) => [...u]));
}
function restore(rows: Unit[][], snap: Unit[][]) {
  snap.forEach((r, i) => { rows[i] = r.map((u) => [...u]); });
}
