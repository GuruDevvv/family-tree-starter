// Места семьи для карты: у каких мест есть координаты и кто с ними связан. Без Leaflet — чтобы проверялось тестами.
import { formatDate } from './card';
import type { LifeEvent, Person, Place, SiteData } from './types';

export interface PlaceStop {
  place: Place;
  people: { person: Person; what: string[] }[];
}

const WHAT: Record<string, [string, string]> = {
  birth: ['родился', 'родилась'],
  death: ['умер', 'умерла'],
  burial: ['похоронен', 'похоронена'],
  residence: ['жил', 'жила'],
  marriage: ['брак', 'брак'],
};

function what(e: LifeEvent, p: Person) {
  const t = e.title ?? WHAT[e.type]?.[p.sex === 'F' ? 1 : 0] ?? e.type;
  const d = formatDate(e.date);
  return d ? `${t}, ${d}` : t;
}

/** Места с координатами и кто с ними связан. Людей в месте сортируем по году первого события. */
export function placeStops(data: SiteData): PlaceStop[] {
  const stops = new Map<string, PlaceStop>();
  for (const pl of data.places) if (pl.coords) stops.set(pl.id, { place: pl, people: [] });
  for (const p of data.people)
    for (const e of p.events ?? []) {
      const s = e.place ? stops.get(e.place) : undefined;
      if (!s) continue;
      let row = s.people.find((x) => x.person.id === p.id);
      if (!row) s.people.push((row = { person: p, what: [] }));
      row.what.push(what(e, p));
    }
  return [...stops.values()].filter((s) => s.people.length);
}

export interface PersonRoute {
  /** места человека с точками — по порядку жизни, подряд одинаковые слиты */
  own: string[];
  /** места человека, его родителей, супругов и детей */
  related: Set<string>;
}

/** Путь человека для карты: где он побывал по порядку и какие места связаны с его ближайшей роднёй. */
export function personRoute(data: SiteData, id: string): PersonRoute {
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const withCoords = new Set(data.places.filter((pl) => pl.coords).map((pl) => pl.id));
  const p = byId.get(id);
  const own: string[] = [];
  if (p) {
    // событие без года остаётся на своём месте среди соседей, но не позже смерти; рождение без года — в начале, смерть — в конце
    const end = (e: { type: string }) => e.type === 'death' || e.type === 'burial';
    const died = Math.min(...(p.events ?? []).filter((e) => end(e) && e.year != null).map((e) => e.year!));
    let prev = -Infinity;
    const keyed = (p.events ?? []).map((e, i) => {
      const k = e.year ?? (e.type === 'birth' ? -Infinity : end(e) ? Infinity : Math.min(prev, died - 1e-6));
      if (e.year != null) prev = e.year;
      return { e, k, i };
    });
    keyed.sort((a, b) => (a.k === b.k ? a.i - b.i : a.k < b.k ? -1 : 1));
    for (const { e } of keyed)
      if (e.place && withCoords.has(e.place) && own[own.length - 1] !== e.place) own.push(e.place);
  }
  const kin = [p, ...[...(p?.parents ?? []), ...(p?.spouses ?? []), ...(p?.children ?? [])].map((l) => byId.get(l.person))];
  const related = new Set<string>();
  for (const k of kin) for (const e of k?.events ?? []) if (e.place && withCoords.has(e.place)) related.add(e.place);
  return { own, related };
}
