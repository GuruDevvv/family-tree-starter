// Читает папку data/ целиком в один объект. Отсутствующие файлы и папки — пустые коллекции.
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';

function readYaml(file, parseErrors) {
  try {
    return yaml.load(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    const line = e.mark ? `строка ${e.mark.line + 1}: ` : '';
    parseErrors.push({ file, message: `не читается YAML, ${line}${e.reason || e.message} (двоеточие внутри текста — возьми текст в кавычки)` });
    return undefined;
  }
}

// Папка с записью на файл: возвращает [{record, file}]
function readDir(dir, parseErrors) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => ({ record: readYaml(path.join(dir, f), parseErrors), file: path.join(dir, f) }))
    .filter((x) => x.record !== undefined);
}

// Файл-список: возвращает [{record, file}] по элементу
function readList(file, parseErrors) {
  if (!fs.existsSync(file)) return [];
  const list = readYaml(file, parseErrors);
  if (list == null) return [];
  if (!Array.isArray(list)) {
    parseErrors.push({ file, message: 'ожидается список (строки, начинающиеся с «- »)' });
    return [];
  }
  return [{ record: list, file }];
}

export function loadData(dir) {
  const parseErrors = [];
  const configFile = path.join(dir, 'config.yaml');
  const stories = fs.existsSync(path.join(dir, 'stories'))
    ? fs.readdirSync(path.join(dir, 'stories')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
    : [];

  return {
    dir,
    config: fs.existsSync(configFile) ? { record: readYaml(configFile, parseErrors), file: configFile } : null,
    people: readDir(path.join(dir, 'people'), parseErrors),
    places: readDir(path.join(dir, 'places'), parseErrors),
    sources: readDir(path.join(dir, 'sources'), parseErrors),
    requests: readDir(path.join(dir, 'research', 'requests'), parseErrors),
    interviews: readDir(path.join(dir, 'research', 'interviews'), parseErrors),
    media: readList(path.join(dir, 'media.yaml'), parseErrors),
    searchLog: readList(path.join(dir, 'research', 'search-log.yaml'), parseErrors),
    questions: readList(path.join(dir, 'research', 'questions.yaml'), parseErrors),
    archives: readList(path.join(dir, 'reference', 'archives.yaml'), parseErrors),
    eras: readList(path.join(dir, 'reference', 'eras.yaml'), parseErrors),
    placeLinks: readList(path.join(dir, 'reference', 'place-links.yaml'), parseErrors),
    stories,
    parseErrors,
  };
}
