import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { placeStops, personRoute } from './places';
import type { SiteData } from './types';

const real = path.resolve(__dirname, '../public/data.json');

describe('карта', () => {
  it.skipIf(!fs.existsSync(real))('у каждого с известным местом есть точка, примерные помечены', () => {
    const data = JSON.parse(fs.readFileSync(real, 'utf8')) as SiteData;
    const stops = placeStops(data);
    const onMap = new Set(stops.flatMap((s) => s.people.map((x) => x.person.id)));
    const withCoords = new Set(data.places.filter((p) => p.coords).map((p) => p.id));
    for (const p of data.people) if ((p.events ?? []).some((e) => e.place && withCoords.has(e.place))) expect(onMap.has(p.id)).toBe(true);
    for (const s of stops) if (s.place.coords?.precision === 'approx') expect(s.place.coords.how).toBeTruthy();
  });
});

describe('путь человека', () => {
  const pl = (id: string) => ({ id, name_then: id, coords: { lat: 1, lon: 1, precision: 'exact' as const } });
  const ev = (type: string, place: string, year: number | null) => ({ type, place, year, qualifier: null });
  const person = (id: string, events: ReturnType<typeof ev>[], extra = {}) =>
    ({ id, sex: 'M', name: { full: id, short: id, maiden: null, married: null }, birthYear: null, birthQualifier: null,
      deathYear: null, deathQualifier: null, names: [], relation: null, ahnentafel: null, generation: null, events, ...extra });
  const data = {
    places: [pl('a'), pl('b'), pl('c'), pl('d'), { id: 'x', name_then: 'x' }],
    people: [
      person('ivan', [ev('death', 'c', null), ev('residence', 'b', 1920), ev('residence', 'b', 1925), ev('birth', 'a', 1900), ev('residence', 'x', 1930)],
        { parents: [{ person: 'egor', status: 'confirmed' }] }),
      person('egor', [ev('birth', 'd', 1870)]),
      person('chuzhoy', [ev('birth', 'd', 1880)]),
    ],
  } as unknown as SiteData;

  it('места по порядку жизни, без повторов подряд и без мест без точки', () => {
    expect(personRoute(data, 'ivan').own).toEqual(['a', 'b', 'c']);
  });
  it('событие без даты после смерти в списке встаёт до смерти (призыв в другом городе)', () => {
    const d = { places: data.places, people: [person('semen', [ev('birth', 'a', 1900), ev('death', 'c', 1944), ev('military', 'b', null)])] } as unknown as SiteData;
    expect(personRoute(d, 'semen').own).toEqual(['a', 'b', 'c']);
  });
  it('цветные — места самого человека и ближайшей родни', () => {
    expect([...personRoute(data, 'ivan').related].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...personRoute(data, 'chuzhoy').related]).toEqual(['d']);
  });
});
