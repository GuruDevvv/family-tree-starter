// Подписи и картинки для людей: годы, «кем приходится», силуэт.
import type { Person, Qualifier, SiteData } from './types';
import silM from './assets/sil-m.png';
import silF from './assets/sil-f.png';
import silMe from './assets/sil-me.png';
import silBig from './assets/sil-big.png';

function year(y: number | null, q: Qualifier) {
  if (y == null) return '';
  if (q === 'about' || q === 'estimated' || q === 'between') return `≈${y}`; // «между 1960 и 1969» — середина, но не точный год
  if (q === 'before') return `до ${y}`;
  if (q === 'after') return `после ${y}`;
  return String(y);
}

export function years(p: Person) {
  const b = year(p.birthYear, p.birthQualifier);
  const d = year(p.deathYear, p.deathQualifier);
  if (b && d) return `${b}–${d}`;
  if (d) return `†${d}`;
  return b;
}

/** «прадедушка по маминой линии» */
export function relationText(p: Person) {
  if (!p.relation) return '';
  const t = p.relation.line ? `${p.relation.label} ${p.relation.line}` : p.relation.label;
  return (p.relation.uncertain ? 'возможно, ' : '') + t;
}

/** «предок № 12» — номер в росписи предков, у владельца 1 */
export function ancestorNumber(p: Person) {
  return p.ahnentafel && p.ahnentafel > 1 ? `предок № ${p.ahnentafel}` : '';
}

export function silhouette(p: Person, root: string, big = false) {
  if (p.portraitFile) return p.portraitFile;
  if (p.id === root) return silMe;
  if (p.sex === 'F') return silF;
  return big ? silBig : silM;
}

export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10, h = n % 100;
  return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}

/** Сколько записей о человеке в журнале: поиски и письма. Ноль — кнопку «журнал по нему» не показываем. */
export function personLogCount(data: SiteData, id: string) {
  return (data.searchLog ?? []).filter((e) => e.persons?.includes(id)).length +
    (data.requests ?? []).filter((r) => r.about?.includes(id)).length;
}

// раскрытая книжечка: у человека есть рассказ «Что мы узнали»
export const STORY_MARK =
  '<span class="story-mark" title="Есть рассказ «Что мы узнали»"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/></svg></span>';
