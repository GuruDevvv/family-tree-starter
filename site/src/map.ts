// Карта мест семьи (prototypes/family.html, третий экран): Leaflet, тёплая бумажная подложка,
// булавки как в прототипе: сплошная — место известно точно, пунктирная — примерно.
// Щелчок или касание точки — всплывашка с теми, кто там был. Выбрал человека — две кнопки: карточка и путь.
// Путь (#map/<id>): места человека и его ближайшей родни цветные, остальные серые, линия — где он побывал по порядку.
import L from 'leaflet';
import { placeText } from './card';
import { placeStops, personRoute, type PlaceStop } from './places';
import { years, silhouette, esc } from './people';
import type { Place, SiteData } from './types';

const placeName = (pl: Place) => placeText(pl).split(/[,(]/)[0].trim();

/** ссылка «на Яндекс.Картах»: точка владельца, если есть, иначе по координатам */
function yandexUrl(pl: Place) {
  if (pl.url?.startsWith('https://yandex.ru/maps/')) return pl.url;
  const { lat, lon } = pl.coords!;
  return `https://yandex.ru/maps/?ll=${lon},${lat}&pt=${lon},${lat}&z=14`;
}

const acts = (id: string) =>
  `<div class="acts"><a class="btn" href="#card/${esc(id)}">Карточка</a><a class="btn alt" href="#map/${esc(id)}">Путь</a></div>`;

function placeFoot(pl: Place) {
  const approx = pl.coords!.precision === 'approx';
  return (approx ? `<div class="pop-approx">Точка примерная${pl.coords!.how ? `: ${esc(pl.coords!.how)}` : ''}</div>` : '') +
    `<a class="ya" href="${esc(yandexUrl(pl))}" target="_blank" rel="noopener">Открыть в Яндекс.Картах</a>`;
}

function popupHtml(s: PlaceStop, root: string) {
  const head = `<div class="pop-place">${esc(placeText(s.place))}</div>`;
  if (s.people.length === 1) {
    const { person: p, what } = s.people[0];
    return `<div class="pop one"><div class="oval"><img src="${silhouette(p, root)}" alt=""></div><div>` +
      `<h3>${esc(p.name.short)}</h3>${years(p) ? `<div class="py">${esc(years(p))}</div>` : ''}${head}` +
      `<div class="pw">${what.map(esc).join('<br>')}</div>${acts(p.id)}${placeFoot(s.place)}</div></div>`;
  }
  return `<div class="pop many">${head}<ul>${whoRows(s, root)}</ul>${placeFoot(s.place)}</div>`;
}

// человек в списке места: касание раскрывает под ним кнопки «Карточка» и «Путь»
const whoRows = (s: PlaceStop, root: string) => s.people.map(({ person: p, what }) =>
  `<li><button type="button" class="who-row"><div class="oval"><img src="${silhouette(p, root)}" alt=""></div>` +
  `<span><b>${esc(p.name.short)}</b><span>${what.map(esc).join('; ')}</span></span></button>${acts(p.id)}</li>`).join('');

let map: L.Map | null = null;

export function mountMap(el: HTMLElement, data: SiteData, phone: boolean, routeOf?: string) {
  map?.remove();
  const stops = placeStops(data);
  const root = data.meta.root;
  const who = routeOf ? data.people.find((p) => p.id === routeOf) : undefined;
  const route = who ? personRoute(data, who.id) : null;
  const order = new Map(route?.own.map((id, i) => [id, i + 1]));

  el.innerHTML = `<div class="map-box${route ? ' routing' : ''}">` +
    (who ? `<div class="route-bar"><span>Путь: <b>${esc(who.name.short)}</b>` +
      `${route!.own.length ? ` · мест на карте: ${route!.own.length}` : ' · мест с точками на карте нет'}</span>` +
      `<a href="#card/${esc(who.id)}">карточка</a><a href="#map">показать всех</a></div>` : '') +
    `<div class="map" aria-label="Карта мест семьи"></div>` +
    (route ? `<div class="legend"><div><i></i>места его и ближайшей родни</div><div><i class="g"></i>остальные места</div>` +
      `<div><i class="ln"></i>путь по порядку лет</div></div>`
      : `<div class="legend"><div><i></i>место известно точно</div><div><i class="a"></i>место примерное, уточняем</div></div>`) +
    `</div>` +
    (phone ? `<div class="pm-list">${stops.map((s, i) => `<section class="pm-item" data-i="${i}"><b>${esc(placeName(s.place))}</b>` +
      `<span class="pm-where">${esc(placeText(s.place))}${s.place.coords!.precision === 'approx' ? ' · <i>точка примерная</i>' : ''}</span>` +
      `<ul>${whoRows(s, root)}</ul><a class="ya" href="${esc(yandexUrl(s.place))}" target="_blank" rel="noopener">Открыть в Яндекс.Картах</a>` +
      `</section>`).join('')}</div>` : '');

  map = L.map(el.querySelector<HTMLElement>('.map')!, { zoomControl: false, attributionControl: true, worldCopyJump: true });
  L.control.zoom({ position: 'bottomleft', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map);
  // Основной OpenStreetMap не отдаёт карту без адреса страницы, а у открытой с диска страницы адреса нет
  // (вместо карты приходит заглушка «Access blocked»). С диска берём немецкий сервер OSM: подписи
  // по-русски с немецким дублем. Через адрес (npm run open, сервер для родных) — обычный OSM.
  const fromDisk = location.protocol === 'file:';
  L.tileLayer(fromDisk ? 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">участники OpenStreetMap</a>',
  }).addTo(map);

  const pick = (i: number) => {
    el.querySelectorAll('.pm-item').forEach((x, k) => x.classList.toggle('on', k === i));
    el.querySelector(`.pm-item[data-i="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const markers = stops.map((s, i) => {
    const c = s.place.coords!;
    const n = order.get(s.place.id);
    const state = !route ? '' : n ? ' own' : route.related.has(s.place.id) ? ' kin' : ' dim';
    const icon = L.divIcon({
      className: `pin${c.precision === 'approx' ? ' approx' : ''}${state}`,
      html: `<span class="dot">${n ?? ''}</span><span class="pl">${esc(placeName(s.place))}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    const m = L.marker([c.lat, c.lon], { icon, title: placeText(s.place), keyboard: true, zIndexOffset: n ? 1000 : state === ' kin' ? 500 : 0 }).addTo(map!);
    // на телефоне всплывашка не помещается над невысокой картой — подсвечиваем место в списке под картой
    if (phone) m.on('click', () => pick(i));
    else m.bindPopup(popupHtml(s, root), { className: 'fam-pop', maxWidth: 420, minWidth: 260, offset: [0, -8], autoPanPadding: [40, 90] });
    return m;
  });

  // кнопки под выбранным человеком — и во всплывашке, и в списке на телефоне
  el.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('.who-row');
    if (!row) return;
    const li = row.parentElement!;
    li.parentElement!.querySelectorAll('li').forEach((x) => x !== li && x.classList.remove('sel'));
    li.classList.toggle('sel');
  });

  const ll = (id: string) => { const c = data.places.find((p) => p.id === id)!.coords!; return [c.lat, c.lon] as [number, number]; };
  if (route && route.own.length > 1)
    L.polyline(route.own.map(ll), { className: 'route-line', color: '#a9532f', weight: 3, opacity: 0.85, dashArray: '8 8', interactive: false }).addTo(map);

  // в режиме пути отдаляем так, чтобы были видны все цветные места; иначе — все места семьи
  const focus = route && route.related.size ? stops.filter((s) => route.related.has(s.place.id)) : stops;
  const bounds = L.latLngBounds(focus.map((s) => [s.place.coords!.lat, s.place.coords!.lon] as [number, number]));
  if (focus.length > 1) {
    map.fitBounds(bounds, { padding: phone ? [40, 40] : [140, 140], maxZoom: route ? 9 : 6 });
    // на широком экране fitBounds отдаляет так, что соседние города слипаются — приближаем, пока всё влезает
    for (let z = map.getZoom() + 1; z <= (route ? 9 : 5); z++) {
      const a = map.project(bounds.getNorthWest(), z), b = map.project(bounds.getSouthEast(), z);
      const size = map.getSize();
      if (b.x - a.x > size.x - 280 || b.y - a.y > size.y - 200) break;
      map.setView(bounds.getCenter(), z);
    }
  }
  else if (focus.length) map.setView(bounds.getCenter(), route ? 8 : 6);
  else map.setView([55, 60], 3);

  el.querySelectorAll<HTMLElement>('.pm-item').forEach((b) => {
    b.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a, button')) return;
      const i = +b.dataset.i!;
      map!.setView(markers[i].getLatLng(), Math.max(map!.getZoom(), 5));
      pick(i);
    });
  });
}

export function unmountMap() {
  map?.remove();
  map = null;
}
