import { describe, it, expect } from 'vitest';
import { parseDate, midYear } from '../scripts/lib/dates.js';

describe('parseDate', () => {
  it('точные даты в разных записях', () => {
    expect(parseDate(1902)).toMatchObject({ min: 1902, qualifier: 'exact' });
    expect(parseDate('1902-03').min).toBeCloseTo(1902 + 2 / 12);
    expect(parseDate('1902-03-15').min).toBeCloseTo(parseDate('15.03.1902').min);
    expect(parseDate('03.1902').min).toBeCloseTo(parseDate('1902-03').min);
  });

  it('около и оценка расширяют диапазон', () => {
    const r = parseDate('около 1850');
    expect(r.qualifier).toBe('about');
    expect(r.min).toBe(1845);
    expect(r.max).toBeCloseTo(1856);
    expect(parseDate('~1850').qualifier).toBe('about');
    expect(parseDate('оценка 1850').min).toBe(1840);
  });

  it('до, после, между', () => {
    expect(parseDate('до 1900')).toMatchObject({ min: -Infinity, qualifier: 'before' });
    expect(parseDate('после 1900')).toMatchObject({ min: 1900, max: Infinity, qualifier: 'after' });
    const b = parseDate('между 1848 и 1852');
    expect(b.min).toBe(1848);
    expect(b.max).toBeCloseTo(1853);
    expect(parseDate('1848–1852').qualifier).toBe('between');
    expect(parseDate('1848-1852').qualifier).toBe('between');
  });

  it('мусор и перевёрнутый диапазон не принимаются', () => {
    expect(parseDate('давно')).toBeNull();
    expect(parseDate('1902-13')).toBeNull();
    expect(parseDate('между 1860 и 1850')).toBeNull();
  });

  it('середина диапазона', () => {
    expect(midYear(parseDate('между 1848 и 1852'))).toBeCloseTo(1850.5);
    expect(midYear(parseDate('до 1900'))).toBeCloseTo(1901);
  });
});
