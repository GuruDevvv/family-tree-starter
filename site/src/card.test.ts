import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatDate, placeText, cardHtml } from './card';
import { docsHtml, personDocs } from './docs';
import type { SiteData } from './types';

describe('карточка', () => {
  it('даты по-русски, неточные — как записаны', () => {
    expect(formatDate('1938-07-29')).toBe('29 июля 1938');
    expect(formatDate('1941-12')).toBe('декабрь 1941');
    expect(formatDate(1900)).toBe('1900');
    expect(formatDate('между 1960 и 1969')).toBe('между 1960 и 1969');
    expect(formatDate(undefined)).toBe('');
  });

  it('место: тогда и сейчас без повторов', () => {
    expect(placeText({ id: 'a', name_then: 'г. Царицын', name_now: 'Волгоград' })).toBe('Царицын (сейчас Волгоград)');
    expect(placeText({ id: 'b', name_then: 'п. Узловая', name_now: 'г. Узловая, Тульская область' })).toBe('Узловая, Тульская область');
    expect(placeText({ id: 'c', name_then: 'г. Москва', name_now: 'Москва' })).toBe('Москва');
  });

  const real = path.resolve(__dirname, '../public/data.json');
  it.skipIf(!fs.existsSync(real))('годы жизни совпадают с точной датой (12.11.1911 — это 1911, не 1912)', () => {
    const data = JSON.parse(fs.readFileSync(real, 'utf8')) as SiteData;
    for (const p of data.people) {
      for (const [type, year] of [['birth', p.birthYear], ['death', p.deathYear]] as const) {
        const d = p.events?.find((e) => e.type === type)?.date;
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) expect(year, `${p.id} ${type}`).toBe(+d.slice(0, 4));
      }
    }
  });

  it.skipIf(!fs.existsSync(real))('у каждого события в карточке есть надёжность и источник', () => {
    const data = JSON.parse(fs.readFileSync(real, 'utf8')) as SiteData;
    for (const p of data.people) {
      const html = cardHtml(p, data);
      const events = html.split('<section class="ev').length - 1;
      expect(events).toBe(p.events?.length ?? 0);
      expect((html.match(/<section class="ev[^]*?<\/section>/g) ?? []).every((ev) => /class="pill (document|oral|hypothesis|conflict)/.test(ev) && /Источник:/.test(ev))).toBe(true);
    }
  });

  it.skipIf(!fs.existsSync(real))('документы человека: без рассказов родных, у каждого файла — путь в media/', () => {
    const data = JSON.parse(fs.readFileSync(real, 'utf8')) as SiteData;
    for (const p of data.people) {
      const { sources } = personDocs(p, data);
      expect(sources.every((s) => s.kind !== 'interview')).toBe(true);
      const html = docsHtml(p, data);
      expect(html.split('class="dc"').length - 1).toBe(sources.length);
      for (const m of html.matchAll(/src="([^"]+)"/g)) expect(/^(media|private)\//.test(m[1])).toBe(true);
    }
  });
});
