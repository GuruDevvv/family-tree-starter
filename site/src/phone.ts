// Телефон (макет phone.png): прямые предки одной линии с переключателем «по папе / по маме».
import { years, silhouette, esc, STORY_MARK } from './people';
import type { Person, SiteData } from './types';

let side: 'papa' | 'mama' = 'mama';

const GEN_NAMES = ['', 'родители', 'бабушки и дедушки', 'прабабушки и прадедушки', 'прапрабабушки и прапрадедушки'];

export function renderPhone(el: HTMLElement, data: SiteData, view: string, selected: string, count: string, pageBody = '') {
  const root = data.meta.root;
  const byNum = new Map(data.people.filter((p) => p.ahnentafel).map((p) => [p.ahnentafel!, p]));
  const nav = (v: string, t: string) => `<a href="#${v}"${(view === 'card' ? 'tree' : view) === v ? ' class="on"' : ''}>${t}</a>`;
  let h = `<header class="ph-hdr"><div class="logo2">Наша семья</div><nav class="ph-nav">${nav('tree', 'Древо')}${nav('map', 'Карта')}${nav('log', 'Журнал поиска')}</nav></header><div class="ph-body">`;

  if (view !== 'tree') {
    el.innerHTML = h + `<div class="page">${pageBody}</div></div>`;
    return;
  }

  const node = (p: Person, cls = '') =>
    `<a class="ph-node ${cls}${p.certain === false ? ' unsure' : ''}" href="#card/${esc(p.id)}"><div class="oval"><img src="${silhouette(p, root)}" alt="">${p.researchText ? STORY_MARK : ''}</div>` +
    `<span class="nm">${esc(p.name.short)}</span>${years(p) ? `<span class="ny">${esc(years(p))}</span>` : ''}` +
    `${p.name.married ? `<span class="nmw">в браке ${esc(p.name.married)}</span>` : ''}</a>`;
  const couple = (a?: Person, b?: Person) => {
    const both = a && b;
    return `<div class="ph-couple${both ? ' two' : ''}">${a ? node(a) : ''}${b ? node(b) : ''}${both ? '<svg class="ph-sprig" aria-hidden="true"><use href="#sprig"/></svg>' : ''}</div>`;
  };

  // номера предков одной стороны: у папы 2 → 4,5 → 8..11; у мамы 3 → 6,7 → 12..15
  const start = side === 'papa' ? 2 : 3;
  const maxGen = Math.max(...[...byNum.keys()].map((n) => Math.floor(Math.log2(n))));
  h += `<div class="ph-count">${esc(count)}</div>`;
  for (let g = maxGen; g >= 2; g--) {
    const span = 2 ** (g - 1);
    const from = start * span;
    let row = '';
    // в ряду бывает несколько пар — подписываем, чьи это родители
    for (let n = from; n < from + span; n += 2) {
      if (!byNum.has(n) && !byNum.has(n + 1)) continue;
      const child = byNum.get(n / 2);
      const cap = span > 2 && child ? `<div class="ph-of">родители: ${esc(child.name.short)}</div>` : '';
      row += `<div class="ph-pair">${cap}${couple(byNum.get(n), byNum.get(n + 1))}</div>`;
    }
    if (!row) continue;
    h += `<div class="ph-gen">${GEN_NAMES[g] ?? 'предки'}</div><div class="ph-row">${row}</div><div class="ph-link"></div>`;
  }
  h += `<div class="ph-toggle" role="group" aria-label="Линия"><button data-l="papa" class="${side === 'papa' ? 'on' : ''}">по папе</button><button data-l="mama" class="${side === 'mama' ? 'on' : ''}">по маме</button></div><div class="ph-link"></div>`;
  h += `<div class="ph-row">${couple(byNum.get(2), byNum.get(3))}</div><div class="ph-link"></div>`;
  const me = data.people.find((p) => p.id === root)!;
  h += `<div class="ph-row">${node(me, 'me')}</div><div style="text-align:center"><span class="ph-me-pill">это я</span></div>`;
  const others = data.people.length - byNum.size;
  if (others > 0) h += `<p class="ph-more">Ещё ${others} родных — братья, сёстры и их семьи — видно в полном древе на компьютере.</p>`;
  el.innerHTML = h + '</div>';
  el.querySelectorAll<HTMLButtonElement>('.ph-toggle button').forEach((b) => {
    b.onclick = () => { side = b.dataset.l as 'papa' | 'mama'; renderPhone(el, data, view, selected, count); };
  });
}
