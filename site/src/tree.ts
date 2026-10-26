// Древо на компьютере: узлы и линии по раскладке, приближение вокруг выбранного человека.
// Поведение как в prototypes/family.html: колесо мыши и щипок приближают вокруг выбранного,
// два пальца на тачпаде и мышь двигают, кнопки −/+/«всё древо» внизу слева.
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { layoutTree, linkGeometry, sideBranches, NODE, GAP_OUT, ROW_H, type PlacedNode, type Seg, type TreeLayout } from './layout';
import { years, silhouette, esc, plural, STORY_MARK } from './people';
import type { Person, SiteData } from './types';

const K_MIN = 0.1; // «всё древо» должно помещаться целиком, даже широкое
const K_MAX = 2.5;

export interface TreeView {
  /** light = false — человек выбран (по нему центрируем), но без подсветки: так открывается страница без имени в адресе */
  select(id: string, light?: boolean): void;
}

let saved: ZoomTransform | null = null; // приближение переживает уход в карточку и обратно

export function mountTree(viewport: HTMLElement, data: SiteData, selected: string, onSelect: (id: string) => void,
  onClear: () => void): TreeView {
  const root = data.meta.root;
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const full: TreeLayout | null = data.layout ? { ...data.layout, nodes: new Map(data.layout.nodes.map((n) => [n.id, n])) } : null;

  // ---- боковые ветки: свёрнутые прячутся; раскрытые запоминаются в браузере
  const branches = sideBranches(data.people, root);
  const ownerOf = new Map<string, string>();
  for (const [o, ms] of branches) for (const m of ms) ownerOf.set(m, o);
  const defaultOpen = data.people.filter((p) => p.id === root || (p.ahnentafel ?? 99) <= 3).map((p) => p.id);
  const open = new Set<string>(readOpen() ?? defaultOpen);
  const reveal = (id: string) => {
    const o = ownerOf.get(id);
    if (o && !open.has(o)) { open.add(o); saveOpen(open); }
  };
  reveal(selected);

  // полное древо берём готовым из сборки; свёрнутое считаем здесь, с ограничением по времени, и запоминаем
  const cache = new Map<string, TreeLayout>();
  // prev — что сейчас на экране: тогда видимые остаются на своих местах, а ветка встаёт рядом с предком
  const currentLayout = (prev?: TreeLayout): TreeLayout => {
    const hidden = new Set<string>();
    for (const [o, ms] of branches) if (!open.has(o)) ms.forEach((m) => hidden.add(m));
    if (prev) return layoutTree(data.people.filter((p) => !hidden.has(p.id)), root, { budgetMs: 300, prev });
    if (!hidden.size) return full ?? layoutTree(data.people, root, { budgetMs: 400 });
    const key = [...hidden].sort().join(',');
    if (!cache.has(key)) cache.set(key, layoutTree(data.people.filter((p) => !hidden.has(p.id)), root, { budgetMs: 300 }));
    return cache.get(key)!;
  };

  let L = currentLayout();
  let loose = placeLoose(L);
  let height = 0;
  viewport.innerHTML = '<div class="canvas"></div>';
  const canvas = viewport.querySelector<HTMLElement>('.canvas')!;
  // подсветка ветки: включается выбором человека, снимается щелчком по пустому месту или Esc
  let lit = false;
  const paint = () => {
    canvas.querySelectorAll<HTMLElement>('.node').forEach((n) => n.classList.toggle('sel', lit && n.dataset.id === selected));
    if (lit) paintLineage(canvas, byId, selected);
    else canvas.classList.remove('focus');
  };
  const render = () => {
    loose = placeLoose(L);
    height = L.height + (L.loose.length ? ROW_H + 60 : 0);
    canvas.style.width = `${L.width}px`;
    canvas.style.height = `${height}px`;
    canvas.innerHTML = links(L, height) + nodes(L, loose, byId, root, selected, branches, open);
    paint();
  };
  render();

  const zoomer: ZoomBehavior<HTMLElement, unknown> = zoom<HTMLElement, unknown>()
    .scaleExtent([K_MIN, K_MAX])
    .filter((e: Event) => e.type !== 'wheel' && e.type !== 'dblclick' && !(e as MouseEvent).button)
    .on('zoom', (e) => {
      const t: ZoomTransform = e.transform;
      canvas.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.k})`;
      saved = t;
    });
  const vp = select(viewport);
  vp.call(zoomer);

  const centerOn = (id: string, k: number) => {
    const n = L.nodes.get(id) ?? loose.get(id);
    if (!n) return zoomIdentity.scale(k);
    const cy = n.y + (id === root ? NODE.meH : NODE.ovalH) / 2 + 30;
    return zoomIdentity.translate(viewport.clientWidth / 2 - n.x * k, viewport.clientHeight / 2 - cy * k).scale(k);
  };
  const clampK = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k));
  // «держать в центре»: приближение вокруг выбранного человека; выключено — вокруг точки, куда смотришь
  // (колесо — курсор, кнопки — середина экрана)
  let follow = readFollow();
  const zoomAround = (f: number, ms = 150, at?: [number, number]) => {
    const t0 = zoomTransform(viewport);
    const k = clampK(t0.k * f);
    let t: ZoomTransform;
    if (follow) t = centerOn(selected, k);
    else {
      const [px, py] = at ?? [viewport.clientWidth / 2, viewport.clientHeight / 2];
      t = zoomIdentity.translate(px - ((px - t0.x) * k) / t0.k, py - ((py - t0.y) * k) / t0.k).scale(k);
    }
    if (ms) vp.transition().duration(ms).call(zoomer.transform, t);
    else vp.call(zoomer.transform, t);
  };
  const fitAll = () => {
    const k = clampK(Math.min(viewport.clientWidth / L.width, (viewport.clientHeight - 60) / height));
    return zoomIdentity.translate((viewport.clientWidth - L.width * k) / 2, 50).scale(k);
  };
  // начальный вид: прямые предки целиком, по высоте всё древо, но не мельче 0.62
  const initial = () => {
    const anc = data.people.filter((p) => p.ahnentafel && L.nodes.has(p.id)).map((p) => L.nodes.get(p.id)!.x);
    const k = clampK(Math.max(0.62, Math.min(1, (viewport.clientHeight - 60) / L.height, viewport.clientWidth / (Math.max(...anc) - Math.min(...anc) + NODE.w))));
    const mid = (Math.max(...anc) + Math.min(...anc)) / 2;
    return zoomIdentity.translate(viewport.clientWidth / 2 - mid * k, 50).scale(k);
  };
  vp.call(zoomer.transform, saved ?? initial());

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      const at: [number, number] = [e.clientX - r.left, e.clientY - r.top];
      // щипок на тачпаде приходит как колесо с ctrlKey; колёсико мыши — крупные целые шаги; остальное — два пальца
      const mouse = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
      if (e.ctrlKey) zoomAround(Math.exp(-e.deltaY * 0.01), 0, at);
      else if (mouse) zoomAround(Math.exp(-e.deltaY * 0.001), 150, at);
      else {
        const k = zoomTransform(viewport).k;
        zoomer.translateBy(vp, -e.deltaX / k, -e.deltaY / k);
      }
    },
    { passive: false },
  );

  const followBtn = document.querySelector<HTMLButtonElement>('.zbar [data-z="follow"]');
  const showFollow = () => {
    if (!followBtn) return;
    followBtn.setAttribute('aria-checked', String(follow));
    followBtn.title = follow
      ? 'Сейчас приближаем вокруг выбранного человека. Нажмите — будем приближать там, куда смотрите'
      : 'Сейчас приближаем там, куда смотрите. Нажмите — выбранный человек будет в центре';
  };
  showFollow();
  document.querySelectorAll<HTMLButtonElement>('.zbar button').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.z === 'in') zoomAround(1.25, 250);
      else if (b.dataset.z === 'out') zoomAround(0.8, 250);
      else if (b.dataset.z === 'follow') { follow = !follow; saveFollow(follow); showFollow(); }
      else if (b.dataset.z === 'open') openAll(!allOpen());
      else vp.transition().duration(350).call(zoomer.transform, fitAll());
    };
  });

  // раскрыть или свернуть ветку: предок с кнопкой стоит на месте экрана, остальные плавно отъезжают,
  // новые выходят из предка и пару секунд подсвечены
  let anim = 0;
  let freshTimer = 0;
  const toggle = (ownerId: string) => change(() => { if (open.has(ownerId)) open.delete(ownerId); else open.add(ownerId); }, ownerId);
  // раскрыть всё древо или вернуть как было при первом открытии; на месте экрана стоит выбранный человек
  const allOpen = () => [...branches.keys()].every((o) => open.has(o));
  // всё древо — готовой раскладкой из сборки (она уже по ширине и чище), свёрнутое — той же, что при первом открытии
  const openAll = (on: boolean) => change(() => {
    open.clear();
    for (const id of on ? branches.keys() : defaultOpen) open.add(id);
  }, L.nodes.has(selected) ? selected : root, () => currentLayout());
  const openBtn = document.querySelector<HTMLButtonElement>('.zbar [data-z="open"]');
  const showOpen = () => {
    if (!openBtn) return;
    const on = allOpen();
    openBtn.setAttribute('aria-checked', String(on));
    openBtn.title = on ? 'Показаны все ветки. Нажмите — свернуть как было' : 'Нажмите — показать все боковые ветки сразу';
  };
  showOpen();
  // ownerId — кто стоит на месте экрана; новые выходят из своего предка, уходящие — в него
  function change(apply: () => void, ownerId: string, fresh?: () => TreeLayout) {
    const prev = L;
    const before = prev.nodes.get(ownerId);
    apply();
    saveOpen(open);
    showOpen();
    L = fresh ? fresh() : currentLayout(prev);
    const after = L.nodes.get(ownerId);
    const dx = before && after ? before.x - after.x : 0;
    const dy = before && after ? before.y - after.y : 0;
    const added = [...L.nodes.keys()].filter((id) => !prev.nodes.has(id));
    const removed = [...prev.nodes.keys()].filter((id) => !L.nodes.has(id));
    vp.call(zoomer.transform, zoomTransform(viewport).translate(dx, dy));

    // откуда и куда едет каждый — в координатах новой картинки; новые и уходящие — из предка и в предка
    const hubOf = (id: string) => to.get(ownerOf.get(id) ?? '') ?? after ?? { x: 0, y: 0 };
    const from = new Map<string, { x: number; y: number }>();
    const to = new Map<string, { x: number; y: number }>();
    for (const n of prev.nodes.values()) from.set(n.id, { x: n.x - dx, y: n.y - dy });
    for (const n of L.nodes.values()) to.set(n.id, { x: n.x, y: n.y });
    const big = removed.length ? prev : L; // линии рисуем по той картинке, где людей больше
    const ids = [...big.nodes.keys()];
    const at = (t: number) => {
      const nodes = new Map<string, PlacedNode>();
      for (const id of ids) {
        const a = from.get(id) ?? hubOf(id), b = to.get(id) ?? hubOf(id);
        nodes.set(id, { ...big.nodes.get(id)!, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      return { ...big, nodes };
    };

    cancelAnimationFrame(anim);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      render();
      clearTimeout(freshTimer);
      for (const id of added) canvas.querySelector(`.node[data-id="${CSS.escape(id)}"]`)?.classList.add('fresh');
      freshTimer = window.setTimeout(() => canvas.querySelectorAll('.node.fresh').forEach((n) => n.classList.remove('fresh')), 2600);
    };
    if (reduce || (!added.length && !removed.length)) return finish();

    const A0 = at(0);
    const w = Math.max(prev.width, L.width);
    const h = Math.max(prev.height, L.height) + (L.loose.length ? ROW_H + 60 : 0);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.innerHTML = links(A0, h) + nodes(A0, new Map(), byId, root, selected, branches, open);
    paint();
    const els = new Map<string, HTMLElement>();
    canvas.querySelectorAll<HTMLElement>('.node').forEach((el) => els.set(el.dataset.id!, el));
    for (const id of added) els.get(id)!.style.opacity = '0';
    const T = 650;
    const t0 = performance.now();
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / T);
      const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2; // плавно разгоняемся и тормозим
      const A = at(e);
      for (const [id, n] of A.nodes) {
        const el = els.get(id)!;
        el.style.left = `${n.x}px`;
        el.style.top = `${id === root ? n.y - 6 : n.y}px`;
      }
      for (const id of added) els.get(id)!.style.opacity = String(e);
      for (const id of removed) els.get(id)!.style.opacity = String(1 - e);
      canvas.querySelector('svg.links')!.outerHTML = links(A, h);
      if (p < 1) anim = requestAnimationFrame(frame);
      else finish();
    };
    anim = requestAnimationFrame(frame);
  }

  viewport.addEventListener('click', (e) => {
    const br = (e.target as HTMLElement).closest<HTMLElement>('.br');
    if (br) {
      e.preventDefault();
      e.stopPropagation();
      toggle(br.dataset.br!);
      return;
    }
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.node');
    if (a) {
      e.preventDefault();
      // тот же человек: адрес не меняется и select не придёт — вернуть подсветку здесь
      if (a.dataset.id === selected && !lit) { lit = true; paint(); }
      onSelect(a.dataset.id!);
      return;
    }
    // щелчок по пустому месту (не по кнопке и не после перетаскивания) — снять подсветку
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4;
    if (!moved && !(e.target as HTMLElement).closest('button, a, [role="button"]')) unlight();
  });
  let downAt = { x: 0, y: 0 };
  viewport.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  const unlight = () => {
    if (!lit) return;
    lit = false;
    paint();
    onClear();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewport.isConnected) unlight();
  });

  return {
    select(id, light = true) {
      selected = id;
      lit = light;
      const o = ownerOf.get(id);
      if (o && !open.has(o)) toggle(o);
      paint();
    },
  };
}

const OPEN_KEY = 'ft.openBranches';
const FOLLOW_KEY = 'ft.zoomFollow';
function readOpen(): string[] | null {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function saveOpen(s: Set<string>) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s])); } catch { /* приватный режим — просто не запомним */ }
}
function readFollow(): boolean {
  try { return localStorage.getItem(FOLLOW_KEY) !== '0'; } catch { return true; }
}
function saveFollow(v: boolean) {
  try { localStorage.setItem(FOLLOW_KEY, v ? '1' : '0'); } catch { /* не запомним */ }
}

/** Люди без известной связи с владельцем — отдельной полкой под древом. */
function placeLoose(L: TreeLayout) {
  const m = new Map<string, { x: number; y: number }>();
  L.loose.forEach((id, i) => m.set(id, { x: NODE.w / 2 + 20 + i * GAP_OUT, y: L.height + 60 }));
  return m;
}

function nodes(L: TreeLayout, loose: Map<string, { x: number; y: number }>, byId: Map<string, Person>, root: string, selected: string,
  branches: Map<string, string[]>, open: Set<string>) {
  let h = '';
  // кнопка ветки у предка: «+N» — показать братьев, сестёр и их семьи; «−» — свернуть
  const branchBtn = (id: string) => {
    const n = branches.get(id)?.length;
    if (!n) return '';
    return open.has(id)
      ? `<span class="br open" role="button" data-br="${esc(id)}" title="Свернуть ветку">−</span>`
      : `<span class="br" role="button" data-br="${esc(id)}" title="Показать ветку: ${n} ${plural(n, 'человек', 'человека', 'человек')}">+${n}</span>`;
  };
  const one = (p: Person, x: number, y: number) => {
    const me = p.id === root;
    const yr = years(p);
    h +=
      `<a class="node${me ? ' me' : ''}${p.certain === false ? ' unsure' : ''}${p.id === selected ? ' sel' : ''}" data-id="${esc(p.id)}" href="#tree/${esc(p.id)}" style="left:${x}px;top:${me ? y - 6 : y}px" title="${esc(p.name.full)}${p.certain === false ? ' — родство не доказано' : ''}">` +
      `<div class="oval"><img src="${silhouette(p, root)}" alt=""></div><span class="nm">${esc(p.name.short)}</span>` +
      (yr ? `<span class="ny">${esc(yr)}</span>` : '') +
      (p.name.married ? `<span class="nmw">в браке ${esc(p.name.married)}</span>` : '') +
      (me ? '<span class="mepill">это я</span>' : '') +
      (p.researchText ? STORY_MARK : '') +
      branchBtn(p.id) +
      '</a>';
  };
  for (const n of L.nodes.values()) one(byId.get(n.id)!, n.x, n.y);
  if (L.loose.length) h += `<div class="shelf-cap" style="left:20px;top:${L.height + 14}px">Родные, чьё место в древе пока уточняем</div>`;
  for (const [id, n] of loose) one(byId.get(id)!, n.x, n.y);
  return h;
}

/** Ветка человека: он сам, его супруги, все предки вверх и все потомки вниз. */
export function lineage(byId: Map<string, Person>, id: string): Set<string> {
  const out = new Set<string>([id]);
  for (const l of byId.get(id)?.spouses ?? []) out.add(l.person);
  const walk = (from: string, key: 'parents' | 'children') => {
    for (const l of byId.get(from)?.[key] ?? [])
      if (!out.has(l.person)) { out.add(l.person); walk(l.person, key); }
  };
  walk(id, 'parents');
  walk(id, 'children');
  return out;
}

/** Подсветка ветки выбранного: её люди и линии — ярко, остальное приглушено. */
function paintLineage(canvas: HTMLElement, byId: Map<string, Person>, id: string) {
  const lit = lineage(byId, id);
  canvas.classList.add('focus');
  canvas.querySelectorAll<HTMLElement>('.node').forEach((n) => n.classList.toggle('lit', lit.has(n.dataset.id!)));
  canvas.querySelectorAll<SVGPathElement>('path.ln').forEach((el) => {
    const p = (el.dataset.p ?? '').split(' ').filter(Boolean), c = (el.dataset.c ?? '').split(' ').filter(Boolean);
    const on = c.length ? p.some((x) => lit.has(x)) && c.some((x) => lit.has(x)) : p.length > 0 && p.every((x) => lit.has(x));
    el.classList.toggle('lit', on);
  });
}

const HOP = 6; // полуширина разрыва на пересечении
function links(L: TreeLayout, height: number) {
  const { segs, sprigs } = linkGeometry(L);
  // доказанные связи — сплошной коричневой линией, гипотезы — синей пунктирной (тот же цвет, что у рамки непроверенных)
  const attrs = (hyp: boolean) => (hyp ? 'class="ln hyp"' : 'class="ln"');
  let s = `<svg class="links" width="${L.width}" height="${height}" aria-hidden="true">`;
  // в месте пересечения с чужой линией горизонталь прерывается — видно, что линии не соединяются
  const d = (g: Seg) => {
    if (!g.gaps) return `M${g.x1} ${g.y1} L${g.x2} ${g.y2}`;
    const [l, r] = [Math.min(g.x1, g.x2), Math.max(g.x1, g.x2)];
    let out = `M${l} ${g.y1}`;
    for (const x of g.gaps) out += ` L${x - HOP} ${g.y1} M${x + HOP} ${g.y1}`;
    return `${out} L${r} ${g.y1}`;
  };
  for (const g of segs)
    s += `<path d="${d(g)}" ${attrs(g.hypothesis)} data-p="${esc((g.p ?? []).join(' '))}" data-c="${esc((g.c ?? []).join(' '))}"/>`;
  for (const p of sprigs) s += `<use href="#sprig" x="${p.x - 11}" y="${p.y + 2}" width="22" height="33"/>`;
  return s + '</svg>';
}
