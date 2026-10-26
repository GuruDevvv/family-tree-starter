// Сборка данных для сайта: из загруженного data/ — один объект для site/public/data.json.
// Всё вычисляемое (дети, родство, номера, лента жизни) считается здесь, сайт только показывает.
import { parseDate, midYear } from './dates.js';
import { computeRelations, ahnentafel, generationOf } from './relations.js';

const LIVING_CUTOFF = 1925; // без даты смерти и родившиеся позже — считаем, возможно, живыми

const flat = (items) => items.map((x) => x.record).filter(Boolean);
const flatList = (items) => items.flatMap((x) => (Array.isArray(x.record) ? x.record : []));

function displayName(p) {
  const pick = (type) => p.names.find((n) => (n.type || 'birth') === type);
  // фамилия с рождения бывает отдельной записью: «Анна Петровна» + «урождённая Иванова»
  const birth = p.names.find((n) => (n.type || 'birth') === 'birth' && n.surname) || pick('birth') || p.names[0];
  // Как принято в генеалогии, главная фамилия — с рождения, а последняя «по мужу» идёт подписью (решение владельца 23.10.2026):
  // Пример: при рождении «Иванова», в браке Петрова. Сменённую по своей воле фамилию («сменил(а)») показываем главной: Петров → Иванов.
  const last = p.names.filter((n) => (n.type === 'changed' || n.type === 'married') && n.surname).at(-1);
  const given = p.names.find((n) => n.given && n.type !== 'nickname')?.given || p.names.find((n) => n.given)?.given;
  const patronymic = p.names.find((n) => n.patronymic)?.patronymic;
  const own = last?.type === 'changed' || !birth.surname;
  const surname = own ? last?.surname || birth.surname : birth.surname;
  const maiden = own && last?.surname && birth.surname && last.surname !== birth.surname ? birth.surname : null;
  const married = !own && last?.surname && last.surname !== surname ? last.surname : null;
  // домашнее имя — в скобках рядом: «Мария Иванова (Маша)»
  const nick = p.names.find((n) => n.type === 'nickname' && n.given && n.given !== given)?.given;
  const tail = nick ? ` (${nick})` : '';
  return {
    full: ([surname, given, patronymic].filter(Boolean).join(' ') || '(имя неизвестно)') + tail,
    short: ([given, surname].filter(Boolean).join(' ') || '(имя неизвестно)') + tail,
    maiden,
    married,
  };
}

export function buildSiteData(data, { stories = {}, research = {}, publicBuild = false } = {}) {
  const peopleList = flat(data.people);
  const people = new Map(peopleList.map((p) => [p.id, p]));
  const rootId = data.config.record.root;
  const relations = computeRelations(people, rootId);
  const numbers = ahnentafel(people, rootId);
  const eras = flatList(data.eras).map((e) => ({ ...e, range: parseDate(e.date) }));
  const places = new Map(flat(data.places).map((p) => [p.id, p]));
  const warnings = [];

  const children = new Map();
  for (const p of peopleList) {
    for (const l of p.parents || []) {
      if (!children.has(l.person)) children.set(l.person, []);
      children.get(l.person).push({ person: p.id, status: l.status });
    }
  }
  const spousesOf = (p) => {
    const set = new Map((p.spouses || []).map((l) => [l.person, l.status]));
    for (const o of peopleList) for (const l of o.spouses || []) if (l.person === p.id && !set.has(o.id)) set.set(o.id, l.status);
    return [...set].map(([person, status]) => ({ person, status }));
  };

  // Примерный год рождения для тех, у кого его нет: по родителям (+25), детям (−25), братьям-сёстрам и супругам.
  // Нужен только для решения «возможно, жив» — на сайте не показывается.
  const known = new Map();
  for (const p of peopleList) {
    const r = (p.events || []).filter((e) => e.type === 'birth' || e.type === 'baptism').map((e) => parseDate(e.date)).find(Boolean);
    if (r) known.set(p.id, midYear(r));
  }
  const est = new Map(known);
  for (let pass = 0; pass < 4; pass++) {
    for (const p of peopleList) {
      if (est.has(p.id)) continue;
      const guesses = [];
      for (const l of p.parents || []) if (est.has(l.person)) guesses.push(est.get(l.person) + 25);
      for (const c of children.get(p.id) || []) if (est.has(c.person)) guesses.push(est.get(c.person) - 25);
      for (const s of spousesOf(p)) if (est.has(s.person)) guesses.push(est.get(s.person));
      const parentIds = new Set((p.parents || []).map((l) => l.person));
      for (const o of peopleList) {
        if (o.id !== p.id && est.has(o.id) && (o.parents || []).some((l) => parentIds.has(l.person))) guesses.push(est.get(o.id));
      }
      if (guesses.length) est.set(p.id, Math.min(...guesses));
    }
  }

  // «Проверенная» родня: до владельца можно дойти только по подтверждённым связям. Остальных древо выделяет цветом.
  const certain = new Set([rootId]);
  for (const queue = [rootId]; queue.length; ) {
    const p = people.get(queue.shift());
    if (!p) continue;
    const links = [...(p.parents || []), ...(children.get(p.id) || []), ...spousesOf(p)];
    for (const l of links) if (l.status === 'confirmed' && !certain.has(l.person)) { certain.add(l.person); queue.push(l.person); }
  }

  const outPeople = peopleList.map((p) => {
    const events = (p.events || []).map((e) => {
      const range = parseDate(e.date);
      return { ...e, year: range ? Math.round(midYear(range) * 10) / 10 : null, qualifier: range?.qualifier ?? null };
    }).sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    const life = (types) => (p.events || []).filter((e) => types.includes(e.type)).map((e) => parseDate(e.date)).find(Boolean);
    const birth = life(['birth', 'baptism']);
    const death = life(['death', 'burial']);
    const hasDeath = (p.events || []).some((e) => e.type === 'death' || e.type === 'burial');
    const guess = est.get(p.id);
    const living = p.living === true || (p.living === undefined && !hasDeath && (guess === undefined || guess > LIVING_CUTOFF));

    let lifeline = [];
    if (birth && isFinite(birth.min)) {
      const from = birth.min, to = death && isFinite(death.max) ? death.max : from + 90;
      const traits = [p.estate, p.religion, p.ethnicity, p.sex].filter(Boolean).map((s) => s.toLowerCase());
      lifeline = eras.filter((e) => e.range && midYear(e.range) >= from && midYear(e.range) <= to)
        .filter((e) => !e.affects || e.affects.some((a) => traits.some((t) => t.startsWith(a.toLowerCase().slice(0, 6)))))
        .map((e) => ({ date: e.date, year: Math.round(midYear(e.range)), title: e.title, region: e.region, age: Math.floor(midYear(e.range) - midYear(birth)) }));
    }

    const placeIds = [...new Set(events.map((e) => e.place).filter(Boolean))];
    return {
      ...p,
      name: displayName(p),
      living,
      birthYear: birth ? Math.floor(midYear(birth)) : null, // floor, не round: 12.11.1911 — это 1911, а не 1912
      birthQualifier: birth?.qualifier ?? null,
      deathYear: death ? Math.floor(midYear(death)) : null,
      deathQualifier: death?.qualifier ?? null,
      events,
      children: children.get(p.id) || [],
      spouses: spousesOf(p),
      relation: relations.get(p.id) || null,
      certain: certain.has(p.id),
      ahnentafel: numbers.get(p.id) ?? null,
      generation: generationOf(numbers.get(p.id)),
      lifeline,
      places: placeIds,
      storyText: p.story ? stories[p.story] ?? null : null,
      researchText: research[p.id] ?? null,
      portraitFile: (() => {
        const m = p.portrait ? flatList(data.media).find((x) => x.id === p.portrait) : null;
        if (!m) return null;
        return `${m.private ? 'private' : 'media'}/${m.file}`;
      })(),
    };
  });

  // Живые показываются на сайте для родных полностью, с датами и местами (решение владельца 25.10.2026).
  // Медиа с private: true с того же дня тоже идут на сайт (лежат в data/private, вне git).

  for (const pl of places.values()) if (!pl.coords) warnings.push(`у места «${pl.id}» нет координат — на карте его не будет`);

  return {
    meta: { root: rootId, title: data.config.record.title || 'Родословная', builtAt: new Date().toISOString() },
    people: outPeople,
    places: [...places.values()],
    sources: flat(data.sources),
    media: flatList(data.media)
      .map((m) => ({ ...m, url: `${m.private ? 'private' : 'media'}/${m.file}` })),
    archives: flatList(data.archives),
    placeLinks: flatList(data.placeLinks ?? []),
    searchLog: flatList(data.searchLog),
    questions: flatList(data.questions ?? []),
    requests: flat(data.requests),
    interviews: flat(data.interviews),
    warnings,
  };
}
