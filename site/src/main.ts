// Сайт «Наша семья»: шапка, разделы по адресу (#tree, #tree/<id>, #card/<id>, #map, #log), телефон.
import 'leaflet/dist/leaflet.css'; // до своих стилей, чтобы шрифт и булавки брались наши
import './style.css';
import raw from '../public/data.json';
import logo from './assets/logo.png';
import { mountTree, type TreeView } from './tree';
import { renderPhone } from './phone';
import { years, relationText, ancestorNumber, silhouette, esc, plural, personLogCount } from './people';
import { cardHtml } from './card';
import { mountMap, unmountMap } from './map';
import { logHtml, bindLogNav } from './log';
import { docsHtml } from './docs';
import { linkPlaces } from './placelinks';
import type { SiteData } from './types';

const data = raw as unknown as SiteData;
const root = data.meta.root;
const byId = new Map(data.people.map((p) => [p.id, p]));
const app = document.getElementById('app')!;

let selected = root;
let tree: TreeView | null = null;
let shown = '';

function header(on: string) {
  const a = (v: string, t: string) => `<a href="#${v}"${on === v ? ' class="on"' : ''}>${t}</a>`;
  return `<header class="hdr"><a class="logo" href="#tree"><img src="${logo}" alt=""><b>Наша семья</b></a>` +
    `<nav class="nav">${a('tree', 'Древо')}${a('map', 'Карта')}${a('log', 'Журнал поиска')}</nav></header>`;
}

function generationsCount() {
  const gens = data.people.map((p) => p.generation).filter((g): g is number => g != null);
  return Math.max(...gens) + 1;
}
function countLine() {
  const g = generationsCount(), n = data.people.length;
  return `${g} ${plural(g, 'поколение', 'поколения', 'поколений')} · ${n} ${plural(n, 'человек', 'человека', 'человек')}`;
}

function whoPanel(id: string) {
  const p = byId.get(id)!;
  const me = id === root;
  const yr = years(p);
  const rel = me ? '' : relationText(p);
  return `<span class="lbl">кто это</span>` +
    `<div class="oval por"><img src="${silhouette(p, root)}" alt=""></div>` +
    `<h2>${esc(p.name.short).replace(' ', '<br>')}</h2>` +
    (p.name.married ? `<div class="married">в браке ${esc(p.name.married)}</div>` : '') +
    `<div class="yr">${esc(yr || 'годы неизвестны')}</div>` +
    (me
      ? '<div class="note"><svg viewBox="0 0 44 34" aria-hidden="true"><path d="M40 26 C30 34 12 32 8 6 M3 12 L8 4 L13 11" fill="none" stroke="#a9532f" stroke-width="1.6" stroke-linecap="round"/></svg>это я</div>'
      : (rel ? `<div class="rel">${esc(rel)}</div>` : '<div class="rel">родство пока не определено</div>') +
        (ancestorNumber(p) ? `<span class="num">${ancestorNumber(p)}</span>` : '')) +
    `<a class="btn" href="#card/${esc(id)}">Открыть карточку</a>` +
    (personLogCount(data, id) ? `<a class="btn btn-alt" href="#log/${esc(id)}">Журнал поиска · ${personLogCount(data, id)}</a>` : '') +
    (me ? '<div class="hint">Нажмите на любого человека в древе, чтобы узнать, кем он вам приходится</div>' : '');
}

function showTree(light: boolean) {
  if (shown !== 'tree') {
    app.innerHTML = `<div class="desk">${header('tree')}<div class="viewport" aria-label="Древо"></div>` +
      `<aside class="who"></aside><div class="count">${countLine()}` +
      `<span class="key"><i class="k-ok"></i>родство доказано<i class="k-hyp"></i>гипотеза</span></div>` +
      '<div class="zbar"><button data-z="out" aria-label="Отдалить">−</button><button data-z="in" aria-label="Приблизить">+</button><button class="zall" data-z="all">всё древо</button>' +
      '<button class="zsw" data-z="open" role="switch" aria-checked="false"><i></i>раскрыть древо</button>' +
      '<button class="zsw" data-z="follow" role="switch" aria-checked="true"><i></i>держать в центре</button></div></div>' +
      '<div class="phone"></div>';
    shown = 'tree';
    // подсветку сняли — убрать имя из адреса, иначе после обновления страницы человек выделится снова
    tree = mountTree(app.querySelector('.viewport')!, data, selected, (id) => { location.hash = `#tree/${id}`; },
      () => history.replaceState(null, '', '#tree'));
  }
  tree!.select(selected, light);
  app.querySelector('.who')!.innerHTML = whoPanel(selected);
}

function showPage(view: string, body: string) {
  shown = view;
  tree = null;
  app.innerHTML = `<div class="desk">${header(view === 'card' || view === 'docs' ? 'tree' : view)}<main class="page">${body}</main></div><div class="phone"></div>`;
}

function route() {
  const [view = 'tree', id] = (location.hash || '#tree').slice(1).split('/');
  if (id && byId.has(id) && (view === 'tree' || view === 'card' || view === 'docs')) selected = id;
  // упоминания мест в текстах карточки, журнала и документов — ссылками на статьи о них
  const body = linkPlaces(
    view === 'card' ? cardHtml(byId.get(selected)!, data)
    : view === 'map' ? '<div class="map-slot"></div>'
    : view === 'log' ? logHtml(data, id)
    : view === 'docs' ? docsHtml(byId.get(selected)!, data)
    : '', data.placeLinks);
  unmountMap();
  if (body) showPage(view, body);
  else showTree(!!id && byId.has(id));
  renderPhone(app.querySelector('.phone')!, data, body ? view : 'tree', selected, countLine(), body);
  // карту ставим только в видимую версию (компьютер или телефон): в скрытом блоке Leaflet не знает своего размера
  if (view === 'map') {
    const slot = [...app.querySelectorAll<HTMLElement>('.map-slot')].find((s) => s.offsetParent !== null);
    if (slot) mountMap(slot, data, phoneMq.matches, id);
  }
}

const phoneMq = matchMedia('(max-width:767px)');
phoneMq.addEventListener('change', () => { if (location.hash.startsWith('#map')) route(); });
bindLogNav(app);
window.addEventListener('hashchange', route);
route();
