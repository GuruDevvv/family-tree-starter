// Неточные даты: строка из YAML → диапазон в дробных годах {min, max}.
// Понимает: 1902 · 1902-03 · 1902-03-15 · 15.03.1902 · 03.1902
//           около 1902 · ок. 1902 · ~1902 · оценка 1902
//           до 1902 · после 1902 · между 1848 и 1852 · 1848–1852

const ABOUT_YEARS = 5; // возраст в метриках и ревизиях часто округлён
const ESTIMATE_YEARS = 10;

function exact(text) {
  let m;
  if ((m = text.match(/^(\d{4})$/))) {
    const y = +m[1];
    return { min: y, max: y + 1 - 1e-9 };
  }
  if ((m = text.match(/^(\d{4})-(\d{2})$/))) return month(+m[1], +m[2]);
  if ((m = text.match(/^(\d{2})\.(\d{4})$/))) return month(+m[2], +m[1]);
  if ((m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return day(+m[1], +m[2], +m[3]);
  if ((m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/))) return day(+m[3], +m[2], +m[1]);
  return null;
}

function month(y, mo) {
  if (mo < 1 || mo > 12) return null;
  return { min: y + (mo - 1) / 12, max: y + mo / 12 - 1e-9 };
}

function day(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const v = y + (mo - 1) / 12 + (d - 1) / 365;
  return { min: v, max: v + 1 / 365 - 1e-9 };
}

export function parseDate(input) {
  if (input == null) return null;
  const text = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
  let m;

  if ((m = text.match(/^(?:около|ок\.|~|abt\.?|about)\s*(.+)$/))) {
    const r = exact(m[1]);
    return r && { min: r.min - ABOUT_YEARS, max: r.max + ABOUT_YEARS, qualifier: 'about' };
  }
  if ((m = text.match(/^(?:оценка|est\.?)\s*(.+)$/))) {
    const r = exact(m[1]);
    return r && { min: r.min - ESTIMATE_YEARS, max: r.max + ESTIMATE_YEARS, qualifier: 'estimated' };
  }
  if ((m = text.match(/^(?:до|before)\s+(.+)$/))) {
    const r = exact(m[1]);
    return r && { min: -Infinity, max: r.max, qualifier: 'before' };
  }
  if ((m = text.match(/^(?:после|after)\s+(.+)$/))) {
    const r = exact(m[1]);
    return r && { min: r.min, max: Infinity, qualifier: 'after' };
  }
  if ((m = text.match(/^(?:между\s+)?(\S+)\s*(?:и|–|—|-|\.\.)\s*(\S+)$/)) && !/^\d{4}-\d{2}(-\d{2})?$/.test(text)) {
    const a = exact(m[1]), b = exact(m[2]);
    if (a && b && a.min <= b.max) return { min: a.min, max: b.max, qualifier: 'between' };
    return null;
  }
  const r = exact(text);
  return r && { ...r, qualifier: 'exact' };
}

// Середина диапазона — для сортировки и ленты жизни. Для открытых границ берём закрытую.
export function midYear(range) {
  if (!range) return null;
  if (!isFinite(range.min)) return range.max;
  if (!isFinite(range.max)) return range.min;
  return (range.min + range.max) / 2;
}
