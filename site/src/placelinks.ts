// Упоминания мест в текстах страницы → ссылки на статьи о них (словарь data/reference/place-links.yaml).
// Работает по готовому HTML: трогает только текст между тегами и не лезет внутрь уже стоящих ссылок.
import type { PlaceLink } from './types';

const LETTER = 'А-Яа-яЁё';
const PIN = '<svg viewBox="0 0 24 24" width="0.85em" height="0.85em" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
let cache: { links: PlaceLink[]; re: RegExp; byGroup: PlaceLink[] } | null = null;

function compile(links: PlaceLink[]) {
  if (cache?.links === links) return cache;
  // одна общая регулярка: каждая ссылка — своя именованная группа; среди вариантов на одной позиции побеждает
  // самый длинный, поэтому шаблоны сортируем по длине (уезд раньше города)
  const alts = links
    .flatMap((l, i) => l.match.map((m, j) => ({ m, name: `g${i}_${j}` })))
    .sort((a, b) => b.m.length - a.m.length)
    .map(({ m, name }) => `(?<${name}>${m})`);
  const re = new RegExp(`(?<![${LETTER}])(?:${alts.join('|')})(?![${LETTER}])`, 'gu');
  cache = { links, re, byGroup: links };
  return cache;
}

export function linkPlaces(html: string, links: PlaceLink[] | undefined): string {
  if (!links?.length) return html;
  const { re, byGroup } = compile(links);
  let inLink = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      if (/^<a[\s>]/i.test(part)) inLink++;
      else if (/^<\/a>/i.test(part)) inLink = Math.max(0, inLink - 1);
      return part;
    }
    if (inLink || !part) return part;
    return part.replace(re, (...args) => {
      const groups = args[args.length - 1] as Record<string, string | undefined>;
      const key = Object.keys(groups).find((k) => groups[k] !== undefined)!;
      const l = byGroup[+key.slice(1, key.indexOf('_'))];
      const title = l.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const link = `<a class="plk" href="${encodeURI(l.url)}" target="_blank" rel="noopener" title="${title}">${args[0]}</a>`;
      return l.map ? `${link}<a class="plk-map" href="${encodeURI(l.map)}" target="_blank" rel="noopener" title="На Яндекс.Картах" aria-label="На Яндекс.Картах">${PIN}</a>` : link;
    });
  }).join('');
}
