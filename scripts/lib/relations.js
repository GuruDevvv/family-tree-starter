// Родство относительно корня древа: «прадедушка по папиной линии», номера предков (Ahnentafel), поколение.
// На вход — Map id → человек (как в YAML). Дети вычисляются из parents.

// Все предки человека: id → { dist, uncertain, firstParent }.
// firstParent — через кого из родителей человека идёт путь (для «по папиной / маминой линии»).
function ancestors(people, startId) {
  const result = new Map([[startId, { dist: 0, uncertain: false, firstParent: null }]]);
  let frontier = [startId];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      const cur = result.get(id);
      for (const link of people.get(id)?.parents || []) {
        if (!people.has(link.person)) continue;
        const cand = {
          dist: cur.dist + 1,
          uncertain: cur.uncertain || link.status !== 'confirmed',
          firstParent: cur.firstParent ?? link.person,
        };
        const old = result.get(link.person);
        // ближе — лучше; при равном расстоянии предпочитаем подтверждённый путь
        if (!old || cand.dist < old.dist || (cand.dist === old.dist && old.uncertain && !cand.uncertain)) {
          result.set(link.person, cand);
          next.push(link.person);
        }
      }
    }
    frontier = next;
  }
  return result;
}

const pra = (n) => 'пра'.repeat(Math.max(0, n));
const ORDINAL = { 2: 'двоюродн', 3: 'троюродн', 4: 'четвероюродн' };
const cousinWord = (k, sex) => (ORDINAL[k] ? ORDINAL[k] + (sex === 'F' ? 'ая' : 'ый') : `${k}-юродн${sex === 'F' ? 'ая' : 'ый'}`);
const g = (sex, m, f, u = `${m}/${f}`) => (sex === 'M' ? m : sex === 'F' ? f : u);

// up — шагов вверх от корня до общего предка, down — шагов вниз от общего предка до человека
export function kinshipLabel(up, down, sex) {
  if (up === 0 && down === 0) return 'я';
  if (down === 0) {
    if (up === 1) return g(sex, 'отец', 'мать', 'родитель');
    return pra(up - 2) + g(sex, 'дедушка', 'бабушка', 'дедушка/бабушка');
  }
  if (up === 0) {
    if (down === 1) return g(sex, 'сын', 'дочь', 'ребёнок');
    return pra(down - 2) + g(sex, 'внук', 'внучка', 'внук/внучка');
  }
  // «двоюродный», «троюродный»…; степень 1 — без приставки (родной)
  const deg = (k, word) => (k <= 1 ? word : `${cousinWord(k, sex)} ${word}`);
  if (up === down) return deg(up, g(sex, 'брат', 'сестра', 'брат/сестра'));
  if (up > down) {
    const diff = up - down;
    // брат отца — дядя; брат деда — двоюродный дедушка; двоюродный брат деда — троюродный дедушка
    if (diff === 1) return deg(down, g(sex, 'дядя', 'тётя', 'дядя/тётя'));
    return deg(down + 1, pra(diff - 2) + g(sex, 'дедушка', 'бабушка', 'дедушка/бабушка'));
  }
  const diff = down - up;
  // сын брата — племянник; внук брата — внучатый племянник; сын двоюродного брата — двоюродный племянник
  if (diff === 1) return deg(up, g(sex, 'племянник', 'племянница', 'племянник/племянница'));
  return deg(up, pra(diff - 2) + g(sex, 'внучатый племянник', 'внучатая племянница', 'внучатый племянник'));
}

// Кровное родство: ближайший общий предок
function bloodRelation(people, rootAnc, id) {
  const anc = ancestors(people, id);
  let best = null;
  for (const [cId, c] of anc) {
    const r = rootAnc.get(cId);
    if (!r) continue;
    const total = r.dist + c.dist;
    if (!best || total < best.total || (total === best.total && best.uncertain && !(r.uncertain || c.uncertain))) {
      best = { total, up: r.dist, down: c.dist, uncertain: r.uncertain || c.uncertain, via: r.firstParent };
    }
  }
  return best;
}

export function computeRelations(people, rootId) {
  const rootAnc = ancestors(people, rootId);
  const lineOf = (parentId) => {
    const p = people.get(parentId);
    if (!p) return null;
    return p.sex === 'M' ? 'по папиной линии' : p.sex === 'F' ? 'по маминой линии' : null;
  };

  const out = new Map();
  for (const [id, p] of people) {
    const b = bloodRelation(people, rootAnc, id);
    if (b) {
      const label = kinshipLabel(b.up, b.down, p.sex);
      out.set(id, { label, line: b.up >= 2 ? lineOf(b.via) : null, uncertain: b.uncertain, blood: true, up: b.up, down: b.down });
    }
  }
  // Свойство: супруг кровного родственника — «муж тёти», «жена брата»
  for (const [id, p] of people) {
    if (out.has(id)) continue;
    const spouses = new Set((p.spouses || []).map((l) => l.person));
    for (const [oid, o] of people) if ((o.spouses || []).some((l) => l.person === id)) spouses.add(oid);
    const rel = [...spouses].map((s) => ({ s, r: out.get(s) })).filter((x) => x.r?.blood)
      .sort((a, b) => a.r.up + a.r.down - (b.r.up + b.r.down))[0];
    if (!rel) continue;
    const word = g(p.sex, 'муж', 'жена', 'супруг');
    const label = rel.s === rootId ? word : `${word}: ${rel.r.label}`;
    out.set(id, { label, line: rel.r.line, uncertain: rel.r.uncertain, blood: false });
  }
  return out;
}

// Номера предков: корень 1, отец 2n, мать 2n+1. При родстве по нескольким путям — наименьший номер.
export function ahnentafel(people, rootId) {
  const nums = new Map();
  const queue = [[rootId, 1]];
  while (queue.length) {
    const [id, n] = queue.shift();
    if (nums.has(id) && nums.get(id) <= n) continue;
    nums.set(id, n);
    for (const link of people.get(id)?.parents || []) {
      const parent = people.get(link.person);
      if (!parent) continue;
      if (parent.sex === 'M') queue.push([link.person, 2 * n]);
      else if (parent.sex === 'F') queue.push([link.person, 2 * n + 1]);
    }
  }
  return nums;
}

export function generationOf(n) {
  return n ? Math.floor(Math.log2(n)) : null;
}
