import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadData } from '../scripts/lib/load.js';
import { buildSiteData } from '../scripts/lib/build.js';
import { kinshipLabel } from '../scripts/lib/relations.js';

const data = loadData(path.join(import.meta.dirname, 'fixtures', 'family'));
const site = buildSiteData(data);
const person = (id) => site.people.find((p) => p.id === id);

describe('kinshipLabel', () => {
  it.each([
    [0, 0, 'M', 'я'],
    [1, 0, 'M', 'отец'],
    [1, 0, 'F', 'мать'],
    [2, 0, 'F', 'бабушка'],
    [3, 0, 'M', 'прадедушка'],
    [5, 0, 'M', 'прапрапрадедушка'],
    [0, 1, 'F', 'дочь'],
    [0, 3, 'M', 'правнук'],
    [1, 1, 'F', 'сестра'],
    [2, 1, 'M', 'дядя'],
    [3, 1, 'M', 'двоюродный дедушка'],
    [4, 1, 'F', 'двоюродная прабабушка'],
    [1, 2, 'F', 'племянница'],
    [1, 3, 'M', 'внучатый племянник'],
    [2, 2, 'M', 'двоюродный брат'],
    [3, 3, 'F', 'троюродная сестра'],
    [3, 2, 'F', 'двоюродная тётя'],
    [4, 2, 'M', 'троюродный дедушка'],
    [2, 3, 'M', 'двоюродный племянник'],
  ])('вверх %i, вниз %i, пол %s → %s', (up, down, sex, label) => {
    expect(kinshipLabel(up, down, sex)).toBe(label);
  });
});

describe('родство в тестовой семье', () => {
  it('прямые предки с линией', () => {
    expect(person('testov-aleksey-1985').relation.label).toBe('я');
    expect(person('testov-sergey-1958').relation.label).toBe('отец');
    expect(person('testova-anna-1932').relation).toMatchObject({ label: 'бабушка', line: 'по папиной линии' });
    expect(person('lebedev-nikolay-1929').relation).toMatchObject({ label: 'дедушка', line: 'по маминой линии' });
    expect(person('testov-ivan-1902').relation).toMatchObject({ label: 'прадедушка', line: 'по папиной линии', uncertain: false });
  });

  it('предок через гипотезу помечен как неточный', () => {
    expect(person('testov-semen-1870').relation).toMatchObject({ label: 'прапрадедушка', uncertain: true });
  });

  it('человек без связей — без родства', () => {
    expect(person('testov-matvey-1880').relation).toBeNull();
  });

  it('номера предков и поколения', () => {
    const n = Object.fromEntries(site.people.map((p) => [p.id, p.ahnentafel]));
    expect(n).toMatchObject({
      'testov-aleksey-1985': 1, 'testov-sergey-1958': 2, 'testova-irina-1960': 3,
      'testov-petr-1930': 4, 'testova-anna-1932': 5, 'lebedev-nikolay-1929': 6,
      'testov-ivan-1902': 8, 'testov-semen-1870': 16,
    });
    expect(person('testov-matvey-1880').ahnentafel).toBeNull();
    expect(person('testov-ivan-1902').generation).toBe(3);
  });

  it('дети вычисляются, супруги видны с обеих сторон', () => {
    expect(person('testov-ivan-1902').children.map((c) => c.person)).toEqual(['testov-petr-1930']);
    expect(person('testova-irina-1960').spouses.map((s) => s.person)).toContain('testov-sergey-1958');
  });

  it('лента жизни берёт события эпохи по годам и сословию', () => {
    const titles = person('testov-ivan-1902').lifeline.map((e) => e.title);
    expect(titles).toContain('Коллективизация'); // крестьянин, 1929–1933
    expect(titles).not.toContain('Отмена крепостного права'); // до рождения
  });

  it('живые: явно отмеченные и родившиеся после 1925 без даты смерти', () => {
    expect(person('testov-aleksey-1985').living).toBe(true);
    expect(person('testov-ivan-1902').living).toBe(false);
    expect(person('lebedev-nikolay-1929').living).toBe(false); // есть смерть
  });

  it('отображаемое имя: фамилия с рождения, по мужу — подписью', () => {
    expect(person('testova-irina-1960').name).toMatchObject({ full: 'Лебедева Ирина Николаевна', married: 'Тестова', maiden: null });
  });
});
