// Документы человека (#docs/<id>): что лежит дома, что нашли в архивах и базах, фото. Рассказы родных сюда не входят.
import { esc, relationText, ancestorNumber } from './people';
import { formatDate } from './card';
import type { Media, Person, SiteData, Source } from './types';

const HOME = new Set(['home-document', 'other']);
const SKIP = new Set(['interview']);
const KIND: Record<string, string> = {
  'home-document': 'дома', other: 'фото', zags: 'ЗАГС', 'archive-file': 'архив', 'military-db': 'военная база',
  'repression-db': 'база репрессий', 'metric-book': 'метрическая книга', 'revision-tale': 'ревизская сказка',
  'confession-list': 'исповедная ведомость', census: 'перепись', publication: 'публикация', website: 'сайт',
};

/** Все id источников, на которые опираются сведения о человеке, плюс события других людей, где он участник. */
function sourceIds(p: Person, data: SiteData) {
  const ids = new Set<string>();
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (Array.isArray(o.claims)) for (const c of o.claims as { source?: string }[]) if (c.source) ids.add(c.source);
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
    }
  };
  walk([p.names, p.parents, p.spouses, p.events]);
  for (const other of data.people) for (const e of other.events ?? [])
    if (e.participants?.some((x) => x.person === p.id)) walk(e);
  return ids;
}

export function personDocs(p: Person, data: SiteData) {
  const ids = sourceIds(p, data);
  const sources = data.sources.filter((s) => ids.has(s.id) && !SKIP.has(s.kind));
  const photos = (data.media ?? []).filter((m) => m.persons?.includes(p.id) && m.kind !== 'portrait' && !(m.source && ids.has(m.source)));
  return { sources, photos };
}

export function docsCount(p: Person, data: SiteData) {
  const { sources, photos } = personDocs(p, data);
  return sources.length + photos.length;
}

const thumb = (m: Media) =>
  `<a class="dc-th" href="${esc(m.url)}" target="_blank" rel="noopener" title="${esc(m.caption ?? '')}"><img src="${esc(m.url)}" alt="${esc(m.caption ?? '')}" loading="lazy"></a>`;

function sourceHtml(s: Source, data: SiteData) {
  const media = (data.media ?? []).filter((m) => m.source === s.id && m.kind !== 'portrait');
  return `<li class="dc"><div class="dc-top"><span class="pill dc-k">${esc(KIND[s.kind] ?? s.kind)}</span>` +
    (s.date ? `<span class="lg-d">${esc(formatDate(s.date))}</span>` : '') + `</div>` +
    `<b class="dc-t">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}&nbsp;↗</a>` : esc(s.title)}</b>` +
    (media.length ? `<div class="dc-ths">${media.map(thumb).join('')}</div>` : '') +
    (s.note ? `<details><summary>что в документе</summary><p>${esc(s.note)}</p></details>` : '') + `</li>`;
}

export function docsHtml(p: Person, data: SiteData): string {
  const { sources, photos } = personDocs(p, data);
  const home = sources.filter((s) => HOME.has(s.kind));
  const found = sources.filter((s) => !HOME.has(s.kind));
  const rel = [relationText(p), ancestorNumber(p)].filter(Boolean).join(' · ');
  const list = (xs: Source[]) => `<ul class="dc-list">${xs.map((s) => sourceHtml(s, data)).join('')}</ul>`;
  return `<div class="lg-wrap one"><div class="sheet lg">` +
    `<a class="lg-all" href="#card/${esc(p.id)}">← К карточке</a>` +
    `<h1>Документы: <a href="#card/${esc(p.id)}">${esc(p.name.full || p.name.short)}</a></h1>` +
    (rel ? `<div class="lg-rel">${esc(rel)}</div>` : '') +
    (sources.length + photos.length ? '' : `<p class="lg-sum">Документов пока нет — только рассказы родных.</p>`) +
    (home.length ? `<h2 class="lg-h">Дома, в семье</h2>${list(home)}` : '') +
    (found.length ? `<h2 class="lg-h">Найдено в архивах и базах</h2>${list(found)}` : '') +
    (photos.length ? `<h2 class="lg-h">Фото</h2><div class="dc-ths big">${photos.map(thumb).join('')}</div>` : '') +
    `<a class="btn c-back" href="#card/${esc(p.id)}">← К карточке</a></div></div>`;
}
