import { describe, it, expect } from 'vitest';
import { lineage } from './tree';
import type { Person } from './types';

const link = (person: string) => ({ person, status: 'confirmed' as const });
const p = (id: string, rel: Partial<Pick<Person, 'parents' | 'children' | 'spouses'>> = {}) => ({ id, ...rel }) as Person;

describe('ветка выбранного в древе', () => {
  // дед — отец (+ мать) — я (+ жена) — сын; у отца есть брат с сыном
  const people = [
    p('ded', { children: [link('otec'), link('dyadya')] }),
    p('otec', { parents: [link('ded')], spouses: [link('mat')], children: [link('ya')] }),
    p('mat', { spouses: [link('otec')], children: [link('ya')] }),
    p('dyadya', { parents: [link('ded')], children: [link('brat')] }),
    p('brat', { parents: [link('dyadya')] }),
    p('ya', { parents: [link('otec'), link('mat')], spouses: [link('zhena')], children: [link('syn')] }),
    p('zhena', { spouses: [link('ya')], children: [link('syn')] }),
    p('syn', { parents: [link('ya'), link('zhena')] }),
  ];
  const byId = new Map(people.map((x) => [x.id, x]));

  it('предки вверх, потомки вниз, супруги выбранного', () => {
    expect([...lineage(byId, 'ya')].sort()).toEqual(['ded', 'mat', 'otec', 'syn', 'ya', 'zhena']);
  });
  it('боковые ветки (дядя, двоюродный брат) не подсвечиваются', () => {
    const s = lineage(byId, 'ya');
    expect(s.has('dyadya')).toBe(false);
    expect(s.has('brat')).toBe(false);
  });
  it('у деда подсвечены все потомки', () => {
    expect([...lineage(byId, 'ded')].sort()).toEqual(['brat', 'ded', 'dyadya', 'otec', 'syn', 'ya']);
  });
});
