// Проверка данных древа: схема каждой записи, ссылки между записями, здравый смысл дат и родства.
// Ошибка останавливает сборку, предупреждение — повод посмотреть глазами.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { parseDate } from './dates.js';

const SCHEMAS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');

const AGE = { F: { min: 12, max: 55 }, M: { min: 14, max: 80 }, U: { min: 12, max: 80 } };

function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  for (const f of fs.readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.json'))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, f), 'utf8')));
  }
  return ajv;
}

function schemaMessage(err) {
  const where = err.instancePath || '(корень)';
  switch (err.keyword) {
    case 'required': return `${where}: нет обязательного поля «${err.params.missingProperty}»`;
    case 'additionalProperties': return `${where}: неизвестное поле «${err.params.additionalProperty}»`;
    case 'enum': return `${where}: допустимо только ${err.params.allowedValues.join(', ')}`;
    case 'minItems': return `${where}: нужен хотя бы один элемент (у факта должен быть источник)`;
    case 'pattern': return `${where}: id только латиницей в нижнем регистре, цифры и дефис`;
    case 'anyOf': return `${where}: нужно хотя бы одно из полей (${err.message})`;
    default: return `${where}: ${err.message}`;
  }
}

export function validateData(data) {
  const ajv = buildAjv();
  const errors = [...data.parseErrors];
  const warnings = [];
  const err = (file, message) => errors.push({ file, message });
  const warn = (file, message) => warnings.push({ file, message });

  // 1. Схема
  const check = (schemaId, items) => {
    const validate = ajv.getSchema(schemaId);
    for (const { record, file } of items) {
      if (!validate(record)) {
        // anyOf порождает шумные дочерние ошибки — оставляем только итоговые
        const seen = new Set();
        for (const e of validate.errors) {
          const msg = schemaMessage(e);
          if (!seen.has(msg)) { seen.add(msg); err(file, msg); }
        }
      }
    }
  };
  check('person', data.people);
  check('place', data.places);
  check('source', data.sources);
  check('request', data.requests);
  check('interview', data.interviews);
  check('media', data.media);
  check('search-log', data.searchLog);
  check('questions', data.questions ?? []);
  check('archive', data.archives);
  check('era', data.eras);
  check('place-link', data.placeLinks ?? []);
  for (const { record, file } of data.placeLinks ?? [])
    for (const l of Array.isArray(record) ? record : [])
      for (const m of l.match ?? []) {
        try { new RegExp(m, 'u'); } catch (e) { err(file, `ссылка «${l.title}»: шаблон ${m} не разбирается — ${e.message}`); }
      }
  if (data.config) check('config', [data.config]);
  else err(path.join(data.dir, 'config.yaml'), 'нет файла настроек: в нём указано, кто корень древа (root)');

  // 2. Уникальность id и совпадение с именем файла
  const index = (items, kind, perFile) => {
    const map = new Map();
    for (const { record, file } of items) {
      const list = perFile ? [record] : Array.isArray(record) ? record : [];
      for (const r of list) {
        if (!r || typeof r.id !== 'string') continue;
        if (map.has(r.id)) err(file, `${kind}: id «${r.id}» уже есть в ${map.get(r.id).file}`);
        else map.set(r.id, { record: r, file });
        if (perFile && path.basename(file).replace(/\.ya?ml$/, '') !== r.id) {
          err(file, `${kind}: id «${r.id}» не совпадает с именем файла`);
        }
      }
    }
    return map;
  };
  const people = index(data.people, 'человек', true);
  const places = index(data.places, 'место', true);
  const sources = index(data.sources, 'источник', true);
  index(data.requests, 'запрос', true);
  index(data.interviews, 'опрос', true);
  const media = index(data.media, 'медиа', false);
  const archives = index(data.archives, 'архив', false);
  const stories = new Set(data.stories);

  // 3. Ссылки
  const ref = (file, map, id, what) => {
    if (id != null && !map.has(id)) err(file, `ссылка на несуществующий ${what} «${id}»`);
  };
  const refClaims = (file, claims) => (claims || []).forEach((c) => ref(file, sources, c.source, 'источник'));
  const dateOk = (file, value, where) => {
    if (value == null) return null;
    const r = parseDate(value);
    if (!r) err(file, `${where}: не понимаю дату «${value}» (примеры: 1902, 1902-03-15, около 1902, между 1848 и 1852)`);
    return r;
  };

  if (data.config?.record?.root) ref(data.config.file, people, data.config.record.root, 'человек (root)');

  for (const { record: p, file } of data.people) {
    if (!p || !p.id) continue;
    (p.names || []).forEach((n) => refClaims(file, n.claims));
    if (p.portrait) ref(file, media, p.portrait, 'портрет (медиа)');
    if (p.story && !stories.has(p.story)) err(file, `нет файла истории stories/${p.story}.md`);
    for (const l of [...(p.parents || []), ...(p.spouses || [])]) {
      ref(file, people, l.person, 'человек');
      if (l.person === p.id) err(file, 'человек указан родителем или супругом самому себе');
      refClaims(file, l.claims);
    }
    (p.events || []).forEach((e, i) => {
      const where = `событие ${i + 1} (${e.type})`;
      dateOk(file, e.date, where);
      ref(file, places, e.place, 'место');
      (e.media || []).forEach((m) => ref(file, media, m, 'медиа'));
      refClaims(file, e.claims);
      for (const part of e.participants || []) {
        ref(file, people, part.person, 'человек');
        if (part.person === p.id) err(file, `${where}: человек указан участником собственного события`);
      }
    });
  }
  for (const { record: s, file } of data.sources) {
    if (!s) continue;
    ref(file, archives, s.archive, 'архив');
    ref(file, people, s.informant, 'человек (рассказчик)');
    (s.media || []).forEach((m) => ref(file, media, m, 'медиа'));
    dateOk(file, s.date, 'дата источника');
  }
  for (const { record: pl, file } of data.places) if (pl) ref(file, archives, pl.archive, 'архив');
  for (const { record: list, file } of data.questions ?? [])
    for (const q of Array.isArray(list) ? list : []) (q.about || []).forEach((id) => ref(file, people, id, 'человек (вопрос)'));
  for (const { record: list, file } of data.media) {
    for (const m of Array.isArray(list) ? list : []) {
      (m.persons || []).forEach((id) => ref(file, people, id, 'человек'));
      ref(file, sources, m.source, 'источник');
      const base = m.private ? 'private' : 'media';
      if (m.file && !fs.existsSync(path.join(data.dir, base, m.file))) {
        warn(file, `файл ${base}/${m.file} не найден на диске (медиа не хранятся в git)`);
      }
    }
  }
  for (const { record: list, file } of data.searchLog) {
    for (const s of Array.isArray(list) ? list : []) {
      dateOk(file, s.date, 'журнал поиска');
      (s.persons || []).forEach((id) => ref(file, people, id, 'человек'));
      (s.sources || []).forEach((id) => ref(file, sources, id, 'источник'));
    }
  }
  for (const { record: r, file } of data.requests) {
    if (!r) continue;
    ref(file, archives, r.to, 'архив');
    (r.about || []).forEach((id) => ref(file, people, id, 'человек'));
    (r.sources || []).forEach((id) => ref(file, sources, id, 'источник'));
    dateOk(file, r.sent, 'дата отправки');
    dateOk(file, r.due, 'срок ответа');
  }
  for (const { record: iv, file } of data.interviews) {
    if (!iv) continue;
    ref(file, people, iv.who, 'человек');
    ref(file, sources, iv.source, 'источник');
    dateOk(file, iv.date, 'дата опроса');
  }
  for (const { record: list, file } of data.eras) {
    for (const e of Array.isArray(list) ? list : []) dateOk(file, e.date, `событие эпохи «${e.title}»`);
  }

  // Копии, перепечатки и индексы одной записи (общий record_group) — одно подтверждение, а не несколько.
  // Предупреждаем, когда факт держится только на такой группе: других источников у него нет.
  const groupOf = (id) => sources.get(id)?.record.record_group ?? id;
  for (const { record: p, file } of data.people) {
    if (!p || !p.id) continue;
    const facts = [...(p.names || []), ...(p.parents || []), ...(p.spouses || []), ...(p.events || [])];
    const byGroup = new Map();
    for (const f of facts) {
      const claims = (f.claims || []).filter((c) => c.confidence !== 'hypothesis' && c.confidence !== 'conflict' && sources.has(c.source));
      const groups = new Set(claims.map((c) => groupOf(c.source)));
      if (claims.length > 1 && groups.size === 1) {
        const g = [...groups][0];
        byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
      }
    }
    for (const [g, n] of byGroup) warn(file, `фактов: ${n} — у каждого две ссылки, но это копии одной записи (${g}): подтверждение одно`);
  }

  // 4. Здравый смысл дат и родства
  const lifeOf = (p) => {
    const ev = (types) => (p.events || []).filter((e) => types.includes(e.type)).map((e) => parseDate(e.date)).find(Boolean);
    return { birth: ev(['birth']) || ev(['baptism']), death: ev(['death']) || ev(['burial']) };
  };
  for (const { record: p, file } of people.values()) {
    const life = lifeOf(p);
    if (life.birth && life.death && life.death.max < life.birth.min) err(file, 'дата смерти раньше даты рождения');
    if (p.living && (p.events || []).some((e) => e.type === 'death' || e.type === 'burial')) {
      err(file, 'отмечен живым (living: true), но есть событие смерти');
    }
    const confirmed = (p.parents || []).filter((l) => l.status === 'confirmed' && people.has(l.person));
    for (const sex of ['M', 'F']) {
      if (confirmed.filter((l) => people.get(l.person).record.sex === sex).length > 1) {
        err(file, `два подтверждённых ${sex === 'M' ? 'отца' : 'матери'}: одного из них пометь hypothesis или disputed`);
      }
    }
    for (const l of p.parents || []) {
      const parent = people.get(l.person)?.record;
      if (!parent) continue;
      const pl = lifeOf(parent);
      const name = l.person;
      if (life.birth && pl.birth) {
        if (life.birth.max < pl.birth.min) {
          err(file, `ребёнок родился раньше родителя «${name}»`);
        } else {
          const age = AGE[parent.sex] || AGE.U;
          if (life.birth.max - pl.birth.min < age.min) warn(file, `родителю «${name}» при рождении ребёнка меньше ${age.min} лет`);
          if (life.birth.min - pl.birth.max > age.max) warn(file, `родителю «${name}» при рождении ребёнка больше ${age.max} лет`);
        }
      }
      if (life.birth && pl.death) {
        const grace = parent.sex === 'M' ? 1 : 0; // ребёнок может родиться после смерти отца
        if (life.birth.min > pl.death.max + grace) err(file, `ребёнок родился после смерти родителя «${name}»`);
      }
    }
  }

  // Петля: человек оказался собственным предком
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'active') {
      const entry = people.get(id);
      err(entry.file, `петля в родстве: ${[...trail.slice(trail.indexOf(id)), id].join(' → ')}`);
      return;
    }
    state.set(id, 'active');
    for (const l of people.get(id).record.parents || []) if (people.has(l.person)) visit(l.person, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of people.keys()) visit(id, []);

  return { errors, warnings };
}
