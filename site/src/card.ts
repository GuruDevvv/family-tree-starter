// Карточка человека (prototypes/family.html, второй экран): имена, события с источником и надёжностью,
// лента жизни на фоне эпохи, семья, история, список источников.
// Картинка у события — только если за ней стоит факт из данных (решение владельца, BRIEF.md).
import { parseDate } from '../../scripts/lib/dates.js';
import { years, relationText, ancestorNumber, silhouette, esc, plural, personLogCount } from './people';
import { docsCount } from './docs';
import type { Claim, Confidence, LifeEvent, Link, NameRecord, Person, Place, SiteData, Source } from './types';
import evArrest from './assets/ev-arrest.jpg';
import evAcquit from './assets/ev-acquit.jpg';
import evVkpb from './assets/ev-vkpb.jpg';

const CONF: Record<Confidence, string> = { document: 'документ', oral: 'со слов', hypothesis: 'догадка', conflict: 'расхождение' };
const RELIABILITY: Record<Source['reliability'], string> = {
  original: 'подлинный документ',
  derivative: 'пересказ документа',
  authored: 'составлено позже',
  oral: 'устный рассказ',
};
const NAME_TYPE: Record<string, [string, string]> = {
  birth: ['при рождении', 'при рождении'],
  married: ['по браку', 'по мужу'],
  changed: ['сменил', 'сменила'],
  baptismal: ['крестильное', 'крестильное'],
  variant: ['вариант из записей', 'вариант из записей'],
  nickname: ['домашнее имя', 'домашнее имя'],
};
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const ROLE: Record<string, string> = { godparent: 'Крёстные', witness: 'Свидетели', priest: 'Священник', informant: 'Со слов', spouse: 'Супруг', parent: 'Родители', other: 'Также' };

/** Картинки событий: каждая привязана к факту, а не к типу «вообще». */
function picture(e: LifeEvent) {
  if (e.type === 'repression' && /арест/i.test(e.title ?? '')) return evArrest;
  if (/оправдан|реабилит/i.test(e.title ?? '') || e.type === 'rehabilitation') return evAcquit;
  if (/ВКП\(б\)|КПСС|партбилет/i.test(e.title ?? '')) return evVkpb;
  return null;
}

export function formatDate(d: string | number | undefined) {
  if (d == null || d === '') return '';
  const s = String(d);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTHS_NOM[+m[2] - 1]} ${m[1]}`;
  return s;
}

/** «Царицын (сейчас Волгоград)» или «Узловая, Тульская область» */
export function placeText(pl: Place | undefined) {
  if (!pl) return '';
  const strip = (s: string) => s.replace(/^(г\.|п\.|с\.|д\.|пгт|ст\.|м\.)\s*/i, '').trim();
  const then = strip(pl.name_then);
  if (!pl.name_now) return then;
  const now = strip(pl.name_now);
  if (now.startsWith(then)) return then + now.slice(then.length);
  return `${then} (сейчас ${now})`;
}

function eventTitle(e: LifeEvent, p: Person) {
  if (e.title) return e.title;
  const f = p.sex === 'F';
  const base: Record<string, string> = {
    birth: f ? 'родилась' : 'родился',
    death: f ? 'умерла' : 'умер',
    burial: f ? 'похоронена' : 'похоронен',
    baptism: f ? 'крещена' : 'крещён',
    marriage: 'брак',
    divorce: 'развод',
    residence: f ? 'жила' : 'жил',
    move: f ? 'переехала' : 'переехал',
    military: 'военная служба',
    education: 'учёба',
    occupation: 'работа',
    award: 'награда',
    repression: 'репрессия',
    rehabilitation: f ? 'реабилитирована' : 'реабилитирован',
    census: 'перепись',
    revision: 'ревизская сказка',
  };
  return base[e.type] ?? 'событие';
}

/** Самая сильная опора факта: документ важнее рассказа, рассказ важнее догадки. Расхождение показываем отдельно. */
function strength(claims: Claim[] = []): Confidence {
  for (const c of ['document', 'oral', 'hypothesis'] as Confidence[]) if (claims.some((x) => x.confidence === c)) return c;
  return claims.length ? 'conflict' : 'hypothesis';
}

function pill(c: Confidence, extra = '') {
  return `<span class="pill ${c}${extra}">${CONF[c]}</span>`;
}

export function cardHtml(p: Person, data: SiteData): string {
  const root = data.meta.root;
  const byId = new Map(data.people.map((x) => [x.id, x]));
  const sources = new Map(data.sources.map((s) => [s.id, s]));
  const places = new Map(data.places.map((s) => [s.id, s]));
  const used = new Set<string>();

  const srcLinks = (claims: Claim[] = []) => {
    const ids = [...new Set(claims.filter((c) => c.confidence !== 'conflict').map((c) => c.source))];
    ids.forEach((id) => used.add(id));
    const parts = ids.map((id) => {
      const s = sources.get(id);
      if (!s) return esc(id);
      const t = esc(shortTitle(s));
      return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${t}&nbsp;↗</a>` : t;
    });
    const details = claims.filter((c) => c.detail && c.confidence !== 'conflict').map((c) => `<q>${esc(c.detail!.replace(/^«|»$/g, ''))}</q>`);
    return (parts.length ? `<div class="src">Источник: ${parts.join(', ')}</div>` : '') + (details.length ? `<div class="quote">${details[0]}</div>` : '');
  };
  const conflicts = (claims: Claim[] = []) =>
    claims.filter((c) => c.confidence === 'conflict').map((c) => { used.add(c.source); return `<div class="conflict">${pill('conflict')} ${esc(c.note ?? 'другой источник говорит иначе')}</div>`; }).join('');

  // Две колонки, как разворот альбома: слева портрет, семья и источники; справа — кто это и что о нём известно.
  // Так карточка с одним событием не оставляет пустого листа.
  const rel = p.id === root ? 'это я' : relationText(p);
  const num = ancestorNumber(p);
  let main = `<header class="c-title"><h1>${esc(p.name.full)}</h1>${p.name.married ? `<div class="c-married">в браке — ${esc(p.name.married)}</div>` : ''}<div class="c-years">${esc(years(p) || 'годы неизвестны')}</div>` +
    `<div class="c-rel">${rel ? `<span class="c-relt">${esc(rel)}</span>` : '<span class="c-relt">родство пока не определено</span>'}${num ? `<span class="pill num">${num}</span>` : ''}` +
    (docsCount(p, data) ? `<a class="c-log" href="#docs/${esc(p.id)}">документы · ${docsCount(p, data)} →</a>` : '') +
    (personLogCount(data, p.id) ? `<a class="c-log" href="#log/${esc(p.id)}">журнал поиска · ${personLogCount(data, p.id)} →</a>` : '') + `</div>` +
    namesBlock(p, srcLinks) +
    `</header>`;

  // ---- «Что мы узнали»: рассказ, собранный из найденных документов; абзацы через пустую строку, **жирное** — ключевая мысль
  if (p.researchText)
    main += `<h2 class="c-h">Что мы узнали</h2><div class="story research"><span class="story-src">собрано по документам поиска; где сказано «возможно» — это ещё не доказано</span>` +
      p.researchText.split(/\n\s*\n/).map((t) => `<p>${esc(t.trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1 ↗</a>')}</p>`).join('') + `</div>`;

  // ---- события: строкой «дата — что — откуда», картинка справа, если за ней факт
  const evs = [...(p.events ?? [])].sort((a, b) => (a.year ?? 1e9) - (b.year ?? 1e9));
  main += `<h2 class="c-h">События жизни</h2>`;
  if (!evs.length) main += `<p class="c-empty">Событий пока нет — ни одного документа или рассказа о датах и местах.</p>`;
  else
    main += `<div class="events">` + evs.map((e) => {
      const img = picture(e);
      const pl = places.get(e.place ?? '');
      const approx = pl?.coords?.precision === 'approx';
      const parts = (e.participants ?? []).reduce<Record<string, string[]>>((acc, x) => {
        const who = x.person ? byId.get(x.person) : null;
        const n = who ? `<a href="#card/${esc(who.id)}">${esc(who.name.short)}</a>` : esc(x.name ?? '');
        (acc[x.role] ??= []).push(n + (x.note ? ` (${esc(x.note)})` : ''));
        return acc;
      }, {});
      return `<section class="ev${img ? ' with-ph' : ''}">` +
        `<div class="ev-date"><span class="d">${esc(formatDate(e.date) || 'дата неизвестна')}</span>${pill(strength(e.claims))}</div>` +
        `<div class="ev-body"><span class="t">${esc(eventTitle(e, p))}</span>` +
        (pl ? `<span class="pl">${esc(placeText(pl))}${approx ? ' · <i>место на карте примерное</i>' : ''}` +
          `${pl.url ? ` · <a href="${esc(pl.url)}" target="_blank" rel="noopener">на карте ↗</a>` : ''}</span>` : '') +
        (e.note ? `<span class="n">${esc(e.note)}</span>` : '') +
        Object.entries(parts).map(([role, names]) => `<span class="n"><b>${ROLE[role] ?? role}:</b> ${names.join(', ')}</span>`).join('') +
        conflicts(e.claims) + srcLinks(e.claims) + `</div>` +
        (img ? `<div class="ph"><img src="${img}" alt=""></div>` : '') +
        `</section>`;
    }).join('') + `</div>`;

  const ll = lifeline(p, evs);
  if (ll) main += `<h2 class="c-h">Лента жизни</h2>${ll}`;

  if (p.storyText)
    main += `<h2 class="c-h">История</h2><div class="story">${pill('oral')} <span class="story-src">семейный рассказ</span>` +
      p.storyText.split(/\n\s*\n/).map((t) => `<p>${esc(t.trim())}</p>`).join('') + `</div>`;

  // ---- левая колонка (источники собираются по ходу правой, поэтому строим её после)
  let side = `<div class="oval c-por"><img src="${silhouette(p, root, true)}" alt="Портрет пока не найден"></div>`;
  side += `<h2 class="c-h">Семья</h2>${family(p, byId, root)}`;
  if (used.size) {
    side += `<h2 class="c-h">Источники</h2><ul class="sources">` + [...used].map((id) => {
      const s = sources.get(id);
      if (!s) return '';
      const ref = [s.archive, s.fond && `ф. ${s.fond}`, s.opis && `оп. ${s.opis}`, s.delo && `д. ${s.delo}`, s.list && `л. ${s.list}`].filter(Boolean).join(', ');
      return `<li><b>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}&nbsp;↗</a>` : esc(s.title)}</b>` +
        `<span class="rel-tag ${s.reliability}">${RELIABILITY[s.reliability]}</span>` +
        (ref ? `<span class="ref">${esc(ref)}</span>` : '') + (s.note ? `<span class="ref">${esc(s.note)}</span>` : '') + `</li>`;
    }).join('') + `</ul>`;
  }
  side += `<a class="btn c-back" href="#tree/${esc(p.id)}">← К древу</a>`;
  return `<div class="c-wrap"><article class="card"><aside class="c-side">${side}</aside><div class="c-main">${main}</div></article>` +
    openQuestions(p, evs, data, places) + `</div>`;
}

/**
 * Блок «Открытые вопросы» справа от карточки: что спросить у родных, что искать,
 * что в данных требует проверки (расхождения, догадки, примерные места) и чего не знаем вовсе.
 */
function openQuestions(p: Person, evs: LifeEvent[], data: SiteData, places: Map<string, Place>) {
  const byId = new Map(data.people.map((x) => [x.id, x]));
  const qs = (data.questions ?? []).filter((q) => q.status !== 'answered' && q.about.includes(p.id));
  const ask = (k: string) => qs.filter((q) => q.ask === k).map((q) => esc(q.text));
  const next = (data.searchLog ?? []).filter((s) => s.next && s.persons?.includes(p.id)).map((s) => esc(s.next!));
  // следующий шаг из журнала поиска не повторяем, если он уже есть среди вопросов (те же ключевые слова)
  const words = (t: string) => new Set(t.toLowerCase().match(/[а-яё]{5,}/g) ?? []);
  const asked = ask('search').map(words);
  const fresh = next.filter((t) => { const w = words(t); return !asked.some((a) => [...w].filter((x) => a.has(x)).length >= 3); });
  const search = [...new Set([...ask('search'), ...fresh])];

  const check: string[] = [];
  for (const e of evs) {
    const what = `${esc(eventTitle(e, p))}${e.date ? `, ${esc(formatDate(e.date))}` : ''}`;
    for (const c of e.claims ?? []) if (c.confidence === 'conflict') check.push(`${what}: ${esc(c.note ?? 'источники расходятся')}`);
    if ((e.claims ?? []).length && (e.claims ?? []).every((c) => c.confidence === 'hypothesis')) check.push(`${what} — пока догадка`);
    const pl = places.get(e.place ?? '');
    if (pl?.coords?.precision === 'approx') check.push(`${esc(placeText(pl))} — точное место на карте${pl.coords.how ? ` (${esc(pl.coords.how)})` : ''}`);
  }
  for (const n of p.names)
    for (const c of n.claims ?? [])
      if (c.confidence === 'hypothesis') check.push(`Фамилия ${esc(n.surname ?? n.given ?? '')} — ${esc(c.note ?? 'догадка')}, нужен документ`);
  for (const l of p.parents ?? []) {
    const who = byId.get(l.person);
    const hyp = l.claims?.find((c) => c.confidence === 'hypothesis');
    if (who && (l.status !== 'confirmed' || hyp))
      check.push(`${who.sex === 'F' ? 'Мать' : 'Отец'} — ${esc(who.name.short)}? ${hyp?.note ? esc(hyp.note) : 'родство не подтверждено'}`);
  }
  const gaps = unknowns(p, evs);
  const checks = [...new Set(check)];

  const group = (title: string, items: string[], cls = '') =>
    items.length ? `<section class="q-g ${cls}"><h3>${title}</h3><ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul></section>` : '';
  const total = qs.length + fresh.length + checks.length + (p.note ? 1 : 0);
  let h = `<aside class="c-q" aria-label="Открытые вопросы"><h2>Открытые вопросы${total ? ` <span class="q-n">${total}</span>` : ''}</h2>`;
  h += group('Спросить у папы', ask('papa'), 'ask');
  h += group('Спросить у мамы', ask('mama'), 'ask');
  h += group('Спросить у родных', ask('other'), 'ask');
  h += group('Найти в архивах и базах', search, 'search');
  h += group('Проверить', checks, 'check');
  if (p.note) h += `<section class="q-g note"><h3>Заметка</h3><p>${esc(p.note)}</p></section>`;
  if (gaps.length) h += `<section class="q-g gaps"><h3>Чего пока не знаем</h3><div>${gaps.map((g) => `<span class="gap">${g}</span>`).join('')}</div></section>`;
  return h + `</aside>`;
}

/** Пробелы в знаниях о человеке — подсказка, что спросить у родных или искать в архивах. */
function unknowns(p: Person, evs: LifeEvent[]) {
  const out: string[] = [];
  const f = p.sex === 'F';
  const birth = evs.find((e) => e.type === 'birth');
  if (p.birthYear == null) out.push('год рождения');
  if (!birth?.place) out.push('место рождения');
  if (!p.living && p.deathYear == null) out.push(f ? 'когда умерла' : 'когда умер');
  if (!(p.parents ?? []).length) out.push('родители');
  if (!p.names.some((n) => n.patronymic)) out.push('отчество');
  if (!p.names.some((n) => n.surname)) out.push('фамилия');
  const claims = [...p.names.flatMap((n) => n.claims ?? []), ...evs.flatMap((e) => e.claims ?? [])];
  if (!claims.some((c) => c.confidence === 'document')) out.push('документ — пока только рассказы');
  if (!p.portraitFile) out.push('фотография');
  return out;
}

function shortTitle(s: Source) {
  const m = s.title.match(/^(«[^»]+»)/);
  return m ? m[1] : s.title;
}

function namesBlock(p: Person, srcLinks: (c?: Claim[]) => string) {
  const f = p.sex === 'F';
  const rows = p.names.map((n: NameRecord) => {
    const label = NAME_TYPE[n.type ?? 'birth'][f ? 1 : 0];
    const text = [n.surname, n.given, n.patronymic].filter(Boolean).join(' ');
    const note = n.claims?.find((c) => c.note)?.note;
    return `<li><span class="nt">${label}</span> <b>${esc(text)}</b> ${pill(strength(n.claims))}${note ? ` <span class="nn">${esc(note)}</span>` : ''}</li>`;
  });
  srcLinks(p.names.flatMap((n) => n.claims ?? [])); // источники имён тоже попадают в общий список
  return rows.length > 1 || p.names[0]?.type ? `<ul class="c-names">${rows.join('')}</ul>` : '';
}

function family(p: Person, byId: Map<string, Person>, root: string) {
  const f = (x: Person) => x.sex === 'F';
  const groups: [Link[], (x: Person) => string][] = [
    [p.parents ?? [], (x) => (f(x) ? 'мать' : 'отец')],
    [p.spouses ?? [], (x) => (f(x) ? 'жена' : 'муж')],
    [p.children ?? [], (x) => (f(x) ? 'дочь' : 'сын')],
  ];
  let h = '';
  for (const [links, role] of groups) {
    for (const l of links) {
      const x = byId.get(l.person);
      if (!x) continue;
      h += `<a class="kin" href="#card/${esc(x.id)}"><div class="oval"><img src="${silhouette(x, root)}" alt=""></div>` +
        `<span><b>${esc(x.name.short)}</b><span>${role(x)}${years(x) ? ' · ' + esc(years(x)) : ''}${l.status !== 'confirmed' ? ' · <i>предположительно</i>' : ''}</span></span></a>`;
    }
  }
  return h ? `<div class="kins">${h}</div>` : '<p class="c-empty">Родные пока не внесены.</p>';
}

/** Лента жизни: линия от рождения до смерти, точки — события, полосы — события эпохи; ниже — что происходило в стране. */
function lifeline(p: Person, evs: LifeEvent[]) {
  if (p.birthYear == null) return '';
  const nowY = new Date().getFullYear();
  const dated = evs.filter((e) => e.year != null && e.qualifier !== 'before' && e.qualifier !== 'after');
  const y0 = p.birthYear;
  const openEnd = p.deathYear == null;
  const y1 = p.deathYear ?? (p.living ? nowY : Math.max(y0 + 60, ...dated.map((e) => Math.ceil(e.year!)), ...(p.lifeline ?? []).map((e) => e.year)));
  const W = 800, L = 30, R = 770, Y = 70;
  const X = (y: number) => L + ((R - L) * (y - y0)) / Math.max(1, y1 - y0);
  let s = `<svg class="ll" viewBox="0 0 ${W} 150" role="img" aria-label="Лента жизни ${y0}–${openEnd ? '' : y1}">`;
  // эпоха — полосы под линией
  for (const e of p.lifeline ?? []) {
    const r = parseDate(e.date) as { min: number; max: number } | null;
    if (!r) continue;
    const a = Math.max(y0, r.min), b = Math.min(y1, r.max);
    if (b < a) continue;
    s += `<rect x="${X(a) - 3}" y="${Y + 14}" width="${Math.max(6, X(b) - X(a) + 6)}" height="14" rx="7" fill="#e8c3ad" opacity=".6"><title>${esc(String(e.date))} — ${esc(e.title)}</title></rect>`;
  }
  // год смерти неизвестен — конец линии пунктиром
  const fade = openEnd && !p.living ? 60 : 0;
  s += `<line x1="${L}" y1="${Y}" x2="${R - fade}" y2="${Y}" stroke="#a8875f" stroke-width="1.6"/>`;
  if (fade) s += `<line x1="${R - fade}" y1="${Y}" x2="${R}" y2="${Y}" stroke="#a8875f" stroke-width="1.6" stroke-dasharray="4 5"/>`;
  const step = y1 - y0 > 60 ? 20 : 10;
  for (let y = Math.ceil((y0 + 1) / step) * step; y < y1; y += step)
    if (y - y0 >= step / 3 && y1 - y >= step / 3)
      s += `<circle cx="${X(y)}" cy="${Y}" r="4" fill="#f4ebdc" stroke="#a8875f" stroke-width="1.3"/><text x="${X(y)}" y="${Y + 52}" text-anchor="middle" font-size="15" fill="#76665a">${y}</text>`;
  s += `<circle cx="${X(y0)}" cy="${Y}" r="7" fill="#5a2f1c"/><text x="${X(y0)}" y="${Y + 52}" text-anchor="middle" font-size="17" font-weight="600" fill="#3b2a1e">${y0}</text>`;
  if (!openEnd) s += `<circle cx="${X(y1)}" cy="${Y}" r="7" fill="#5a2f1c"/><text x="${X(y1)}" y="${Y + 52}" text-anchor="middle" font-size="17" font-weight="600" fill="#3b2a1e">${y1}</text>`;
  // события жизни — точки над линией с подписью года, подписи разводим по двум уровням
  let lastX = -1e9, lvl = 0;
  for (const e of dated) {
    if (e.type === 'birth' || e.type === 'death') continue;
    const x = X(Math.min(y1, Math.max(y0, e.year!)));
    lvl = x - lastX < 70 ? 1 - lvl : 0;
    lastX = x;
    const ty = Y - 18 - lvl * 22;
    s += `<line x1="${x}" y1="${Y - 6}" x2="${x}" y2="${ty + 4}" stroke="#a9532f" stroke-width="1" opacity=".5"/>` +
      `<circle cx="${x}" cy="${Y}" r="6.5" fill="#a9532f"><title>${esc(formatDate(e.date))} — ${esc(e.title ?? e.type)}</title></circle>` +
      `<text x="${x}" y="${ty}" text-anchor="middle" font-size="15" fill="#8b3e22">${esc(shortEvent(e))}</text>`;
  }
  s += '</svg>';
  const eras = (p.lifeline ?? []).filter((e) => e.year <= y1);
  const him = p.sex === 'F' ? 'ей' : 'ему';
  const list = eras.length
    ? `<ul class="eras">` + eras.map((e) => `<li><span class="ey">${esc(formatDate(e.date).replace(/^между (\d+) и (\d+)$/, '$1–$2'))}</span> ${esc(e.title)}${e.region ? ` <i>(${esc(e.region)})</i>` : ''}` +
      `<span class="age">${e.age > 0 ? `${him} ${e.age} ${plural(e.age, 'год', 'года', 'лет')}` : 'в год рождения'}</span></li>`).join('') + `</ul>`
    : '';
  return `<div class="lifeline"><div class="ll-scroll">${s}</div>${list ? `<h3 class="c-h3">Что происходило в стране</h3>${list}` : ''}</div>`;
}

function shortEvent(e: LifeEvent) {
  const t = (e.title ?? '').split(/[,;(]/)[0].trim();
  const y = e.year != null ? String(Math.floor(e.year)) : '';
  return t.length > 18 ? y : `${y} ${t.charAt(0).toLowerCase()}${t.slice(1)}`.trim();
}
