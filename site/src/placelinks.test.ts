import { describe, expect, it } from 'vitest';
import { linkPlaces } from './placelinks';

const links = [
  { title: 'Ряжск', url: 'https://ru.wikipedia.org/wiki/Ряжск', match: ['Ряжск(?:а|е|у|ом)?'] },
  { title: 'Ряжский уезд', url: 'https://ru.wikipedia.org/wiki/Ряжский_уезд', match: ['Ряжск(?:ий|ого) уезд(?:а|е)?'] },
  { title: 'Москва', url: 'https://ru.wikipedia.org/wiki/Москва', match: ['Москв(?:а|ы|е)'] },
];

describe('linkPlaces', () => {
  it('делает ссылкой упоминание в любом падеже', () => {
    const h = linkPlaces('<p>жил в Ряжске, потом в Москве</p>', links);
    expect(h).toContain('>Ряжске</a>');
    expect(h).toContain('>Москве</a>');
    expect(h).toContain(encodeURI('https://ru.wikipedia.org/wiki/Москва'));
  });
  it('длинное название побеждает короткое', () => {
    const h = linkPlaces('<p>Ряжского уезда</p>', links);
    expect(h).toContain(`href="${encodeURI('https://ru.wikipedia.org/wiki/Ряжский_уезд')}"`);
    expect(h.match(/<a /g)).toHaveLength(1);
  });
  it('рядом с названием ставит значок карты, если у места есть точка', () => {
    const withMap = [{ ...links[2], map: 'https://yandex.ru/maps/?ll=37.6,55.75&pt=37.6,55.75&z=11' }];
    const h = linkPlaces('<p>в Москве</p>', withMap);
    expect(h).toContain('>Москве</a><a class="plk-map" href="https://yandex.ru/maps/?ll=37.6,55.75&pt=37.6,55.75&z=11"');
    expect(linkPlaces('<p>в Ряжске</p>', links)).not.toContain('plk-map');
  });
  it('не трогает часть другого слова, атрибуты и готовые ссылки', () => {
    expect(linkPlaces('<p>Ряжский район</p>', links)).not.toContain('<a');
    expect(linkPlaces('<p>Московская область</p>', links)).not.toContain('<a');
    expect(linkPlaces('<a href="#x">в Москве</a>', links)).toBe('<a href="#x">в Москве</a>');
    expect(linkPlaces('<img alt="Москва">', links)).toBe('<img alt="Москва">');
  });
});
