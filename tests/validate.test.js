import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadData } from '../scripts/lib/load.js';
import { validateData } from '../scripts/lib/validate.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'family');
const base = loadData(FIXTURE);

// Копия тестовой семьи с правкой одного человека
function withPerson(id, change) {
  const data = structuredClone(base);
  const entry = data.people.find((p) => p.record.id === id);
  change(entry.record, data);
  return validateData(data);
}
const messages = (r) => r.errors.map((e) => e.message).join('\n');

describe('validateData', () => {
  it('тестовая семья проходит без ошибок и предупреждений', () => {
    const r = validateData(structuredClone(base));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('факт без источника', () => {
    const r = withPerson('testov-petr-1930', (p) => { p.events[0].claims = []; });
    expect(messages(r)).toMatch(/хотя бы один элемент/);
  });

  it('ребёнок старше родителя', () => {
    const r = withPerson('testov-petr-1930', (p) => { p.events[0].date = 1890; });
    expect(messages(r)).toMatch(/родился раньше родителя «testov-ivan-1902»/);
  });

  it('ссылка в пустоту: родитель, место, источник', () => {
    const r = withPerson('testov-petr-1930', (p) => {
      p.parents[0].person = 'nobody';
      p.events[0].place = 'nowhere';
      p.events[0].claims[0].source = 'no-source';
    });
    const m = messages(r);
    expect(m).toMatch(/несуществующий человек «nobody»/);
    expect(m).toMatch(/несуществующий место «nowhere»/);
    expect(m).toMatch(/несуществующий источник «no-source»/);
  });

  it('две копии одной записи — одно подтверждение', () => {
    const r = withPerson('testov-petr-1930', (p, data) => {
      const src = data.sources.find((s) => s.record.id === 'src-metric-1902');
      src.record.record_group = 'metric-1902';
      data.sources.push({ file: 'src-metric-1902-copy.yaml', record: { id: 'src-metric-1902-copy', kind: 'website', title: 'Перепечатка', reliability: 'derivative', record_group: 'metric-1902' } });
      p.events[0].claims = [{ source: 'src-metric-1902', confidence: 'document' }, { source: 'src-metric-1902-copy', confidence: 'document' }];
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.message).join()).toMatch(/копии одной записи \(metric-1902\)/);
  });

  it('непонятная дата', () => {
    const r = withPerson('testov-petr-1930', (p) => { p.events[0].date = 'весной'; });
    expect(messages(r)).toMatch(/не понимаю дату «весной»/);
  });

  it('неточные даты не дают ложной тревоги, а явное противоречие ловится', () => {
    // «около 1870» у отца и 1902 у сына — нормально (проверено в базовом прогоне).
    // Сын «между 1860 и 1865» при отце «около 1870» — пересечение есть, ошибки нет, но родитель слишком юн
    const r = withPerson('testov-ivan-1902', (p) => { p.events[0].date = 'между 1860 и 1865'; p.events[1].date = 1865; });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.message).join()).toMatch(/меньше 14 лет/);
  });

  it('смерть раньше рождения и живой с датой смерти', () => {
    const r = withPerson('lebedev-nikolay-1929', (p) => { p.events[2].date = 1920; p.living = true; });
    const m = messages(r);
    expect(m).toMatch(/смерти раньше даты рождения/);
    expect(m).toMatch(/отмечен живым/);
  });

  it('ребёнок родился после смерти матери', () => {
    const r = withPerson('testova-anna-1932', (p) => {
      p.events.push({ type: 'death', date: 1950, claims: [{ source: 'src-owner', confidence: 'oral' }] });
    });
    expect(messages(r)).toMatch(/после смерти родителя «testova-anna-1932»/);
  });

  it('два подтверждённых отца', () => {
    const r = withPerson('testov-petr-1930', (p) => {
      p.parents.push({ person: 'testov-matvey-1880', status: 'confirmed', claims: [{ source: 'src-owner', confidence: 'oral' }] });
    });
    expect(messages(r)).toMatch(/два подтверждённых отца/);
  });

  it('петля в родстве', () => {
    const r = withPerson('testov-semen-1870', (p) => {
      p.parents = [{ person: 'testov-petr-1930', status: 'hypothesis', claims: [{ source: 'src-owner', confidence: 'hypothesis' }] }];
    });
    expect(messages(r)).toMatch(/петля в родстве/);
  });

  it('id не совпадает с именем файла и неизвестное поле', () => {
    const r = withPerson('testov-matvey-1880', (p) => { p.id = 'testov-matvey-1881'; p.nickname = 'Мотя'; });
    const m = messages(r);
    expect(m).toMatch(/не совпадает с именем файла/);
    expect(m).toMatch(/неизвестное поле «nickname»/);
  });

  it('крёстный — несуществующий человек', () => {
    const r = withPerson('testov-ivan-1902', (p) => { p.events[1].participants[0].person = 'ghost'; });
    expect(messages(r)).toMatch(/несуществующий человек «ghost»/);
  });
});
