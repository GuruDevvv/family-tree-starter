// Журнал поиска (задача 9): по каждому человеку — где искали, с каким итогом и что дальше; письма в архивы.
// Показывает только то, что записано в data/research: search-log.yaml, requests/, questions.yaml (ask: search).
import { relationText, ancestorNumber, esc, plural } from './people';
import { formatDate } from './card';
import type { ArchiveRequest, Person, RequestStatus, SearchLogEntry, SiteData } from './types';

const RESULT: Record<SearchLogEntry['result'], [string, string]> = {
  found: ['нашли', 'document'],
  partial: ['частично', 'oral'],
  not_found: ['не нашли', 'conflict'],
};
const STATUS: Record<RequestStatus, string> = {
  draft: 'черновик, не отправлен',
  sent: 'отправлен, ждём ответа',
  paid: 'оплачен, ждём ответа',
  answered: 'ответ получен',
  refused: 'отказ',
  cancelled: 'отменён',
};

/** Порядок: сначала прямые предки по номеру, потом остальные — по тому, как впервые встретились в журнале. */
export function logGroups(data: SiteData) {
  const log = data.searchLog ?? [];
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const entries = new Map<string, SearchLogEntry[]>();
  for (const e of log) for (const id of e.persons ?? []) {
    if (!byId.has(id)) continue;
    if (!entries.has(id)) entries.set(id, []);
    entries.get(id)!.push(e);
  }
  const ancestors = data.people
    .filter((p) => p.ahnentafel && p.ahnentafel > 1 && !p.living)
    .sort((a, b) => a.ahnentafel! - b.ahnentafel!);
  const searched = ancestors.filter((p) => entries.has(p.id));
  const notSearched = ancestors.filter((p) => !entries.has(p.id));
  const others = [...entries.keys()].map((id) => byId.get(id)!).filter((p) => !(p.ahnentafel && p.ahnentafel > 1));
  const general = log.filter((e) => !(e.persons ?? []).some((id) => byId.has(id)));
  return { entries, people: [...searched, ...others], notSearched, general };
}

function entryHtml(e: SearchLogEntry, data: SiteData) {
  const [label, cls] = RESULT[e.result];
  const srcs = (e.sources ?? [])
    .map((id) => data.sources.find((s) => s.id === id))
    .filter((s) => s)
    .map((s) => (s!.url ? `<a href="${esc(s!.url)}" target="_blank" rel="noopener">${esc(s!.title)} ↗</a>` : esc(s!.title)));
  return `<li class="lg-e"><div class="lg-top"><span class="pill ${cls}">${label}</span>` +
    `<b>${esc(e.where)}</b><span class="lg-d">${esc(formatDate(e.date))}</span></div>` +
    (e.summary ? `<p class="lg-sm">${esc(e.summary)}</p>` : '') +
    (e.query ? `<div class="lg-q">Искали: ${esc(e.query)}</div>` : '') +
    (srcs.length ? `<div class="lg-src">Источник: ${srcs.join('; ')}</div>` : '') +
    (e.note ? `<details><summary>подробности</summary><p>${esc(e.note)}</p></details>` : '') +
    (e.next ? `<div class="lg-next">Дальше: ${esc(e.next)}</div>` : '') +
    `</li>`;
}

const relLine = (p: Person) => [relationText(p), ancestorNumber(p)].filter(Boolean).join(' · ');

function todoHtml(p: Person, data: SiteData) {
  const todo = (data.questions ?? []).filter((q) => q.ask === 'search' && q.status === 'open' && q.about.includes(p.id));
  return todo.length ? `<div class="lg-todo"><h3>Ещё поискать</h3><ul>${todo.map((q) => `<li>${esc(q.text)}</li>`).join('')}</ul></div>` : '';
}

function personHtml(p: Person, list: SearchLogEntry[], data: SiteData) {
  const rel = relLine(p);
  return `<section class="lg-p" data-sec="p-${esc(p.id)}"><h2><a href="#card/${esc(p.id)}">${esc(p.name.full || p.name.short)}</a></h2>` +
    (rel ? `<div class="lg-rel">${esc(rel)}</div>` : '') +
    `<ul class="lg-list">${list.map((e) => entryHtml(e, data)).join('')}</ul>` + todoHtml(p, data) +
    `</section>`;
}

function requestHtml(r: ArchiveRequest, data: SiteData) {
  const arch = data.archives?.find((a) => a.id === r.to);
  const who = (r.about ?? []).map((id) => data.people.find((p) => p.id === id)?.name.short).filter(Boolean).join(', ');
  const facts = [
    `Статус: ${STATUS[r.status]}`,
    r.sent ? `отправлен ${formatDate(r.sent)}` : '',
    r.due ? `ответ ждём до ${formatDate(r.due)}` : '',
    r.cost != null ? (r.cost ? `стоимость ${r.cost} ₽` : 'бесплатно') : '',
  ].filter(Boolean).join(' · ');
  return `<li class="lg-r"><b>${esc(r.what)}</b>` +
    `<div class="lg-q">${esc(arch?.name ?? r.to)}${who ? ` · о ком: ${esc(who)}` : ''}</div>` +
    `<div class="lg-st">${esc(facts)}</div>` +
    (r.answer ? `<div class="lg-next">Ответ: ${esc(r.answer)}</div>` : '') +
    (r.note ? `<div class="lg-src">${esc(r.note)}</div>` : '') + `</li>`;
}

/** Окошко слева: письма, каждый человек, «без привязки», «ещё не искали». Адрес не меняем — он занят разделами сайта. */
function navHtml(people: (readonly [Person, number])[], letters: number, gaps: number, general: number) {
  const item = (to: string, label: string, n: number) => `<button class="lg-chip" data-go="${to}">${esc(label)} <span>${n}</span></button>`;
  return `<nav class="lg-nav" aria-label="Разделы журнала">` +
    (letters ? item('letters', 'Письма в архивы', letters) : '') +
    `<div class="lg-nav-h">По людям</div>` +
    people.map(([p, n]) => item(`p-${p.id}`, p.name.short, n)).join('') +
    (general || gaps ? `<div class="lg-nav-h">Прочее</div>` : '') +
    (general ? item('general', 'Без привязки', general) : '') +
    (gaps ? item('gaps', 'Ещё не искали', gaps) : '') +
    `</nav>`;
}

/** Нажатие в окошке прокручивает к разделу внутри той же страницы (журнал есть и в компьютерной, и в телефонной версии). */
export function bindLogNav(root: HTMLElement) {
  root.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-go]');
    if (!btn) return;
    btn.closest('.lg-wrap')?.querySelector(`[data-sec="${btn.dataset.go}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** Журнал по одному человеку (#log/<id>): его письма, поиски и что ещё поискать. */
function personLogPage(p: Person, data: SiteData) {
  const list = (data.searchLog ?? []).filter((e) => e.persons?.includes(p.id));
  const reqs = (data.requests ?? []).filter((r) => r.about?.includes(p.id));
  const count = (r: SearchLogEntry['result']) => list.filter((e) => e.result === r).length;
  const name = p.name.full || p.name.short;
  return `<div class="lg-wrap one"><div class="sheet lg">` +
    `<a class="lg-all" href="#log">← Весь журнал</a>` +
    `<h1>Журнал поиска: <a href="#card/${esc(p.id)}">${esc(name)}</a></h1>` +
    (relLine(p) ? `<div class="lg-rel">${esc(relLine(p))}</div>` : '') +
    `<p class="lg-sum">${list.length ? `${list.length} ${plural(list.length, 'поиск', 'поиска', 'поисков')}: нашли ${count('found')}, частично ${count('partial')}, не нашли ${count('not_found')}.` : 'Поисков пока не было.'}` +
    (reqs.length ? ` ${reqs.length} ${plural(reqs.length, 'письмо', 'письма', 'писем')} в архивы.` : '') + `</p>` +
    (reqs.length ? `<h2 class="lg-h">Письма в архивы</h2><ul class="lg-reqs">${reqs.map((r) => requestHtml(r, data)).join('')}</ul>` : '') +
    (list.length ? `<h2 class="lg-h">Где искали</h2><ul class="lg-list">${list.map((e) => entryHtml(e, data)).join('')}</ul>` : '') +
    todoHtml(p, data) +
    `<a class="btn c-back" href="#card/${esc(p.id)}">← К карточке</a></div></div>`;
}

export function logHtml(data: SiteData, personId?: string): string {
  const person = personId ? data.people.find((p) => p.id === personId) : undefined;
  if (person) return personLogPage(person, data);
  const log = data.searchLog ?? [];
  const { entries, people, notSearched, general } = logGroups(data);
  const count = (r: SearchLogEntry['result']) => log.filter((e) => e.result === r).length;
  const reqs = data.requests ?? [];
  return `<div class="lg-wrap">` +
    navHtml(people.map((p) => [p, entries.get(p.id)!.length] as const), reqs.length, notSearched.length, general.length) +
    `<div class="sheet lg">` +
    `<h1>Журнал поиска</h1>` +
    `<p class="lg-sum">${log.length} ${plural(log.length, 'поиск', 'поиска', 'поисков')}: нашли ${count('found')}, частично ${count('partial')}, не нашли ${count('not_found')}. ` +
    `Записываем и пустые поиски, чтобы не повторять их.</p>` +
    `<h2 class="lg-h" data-sec="letters">Письма в архивы</h2>` +
    (reqs.length ? `<ul class="lg-reqs">${reqs.map((r) => requestHtml(r, data)).join('')}</ul>` : `<p class="c-empty">Писем пока нет.</p>`) +
    `<h2 class="lg-h" data-sec="people">Где искали — по людям</h2>` +
    people.map((p) => personHtml(p, entries.get(p.id)!, data)).join('') +
    (general.length ? `<section class="lg-p" data-sec="general"><h2>Без привязки к человеку</h2><ul class="lg-list">${general.map((e) => entryHtml(e, data)).join('')}</ul></section>` : '') +
    (notSearched.length
      ? `<h2 class="lg-h" data-sec="gaps">Ещё не искали</h2><p class="lg-sum">Предки, по которым поиска пока не было. Обычно не хватает имени, фамилии или года.</p>` +
        `<div class="lg-gaps">${notSearched.map((p) => `<a class="gap" href="#card/${esc(p.id)}">${esc(p.name.short)}</a>`).join('')}</div>`
      : '') +
    `<a class="btn c-back" href="#tree">← К древу</a></div></div>`;
}
