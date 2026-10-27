// Запуск: node scripts/build.js [папка-данных] [файл-результата]
// Проверяет данные (при ошибках останавливается), считает родство и пишет site/public/data.json.
// Медиа копируются в site/public/media (в git не попадают). Личные сканы из data/private — в site/public/private,
// только для сайта на компьютере владельца; с флагом --public (выкладка для родных) они не попадают никуда.
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from './lib/load.js';
import { validateData } from './lib/validate.js';
import { buildSiteData } from './lib/build.js';
import { questionsMarkdown } from './lib/questions.js';
import { layoutTree } from '../site/src/layout.ts';

const publicBuild = process.argv.includes('--public');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dir = path.resolve(args[0] || 'data');
const outFile = path.resolve(args[1] || 'site/public/data.json');
const data = loadData(dir);
const { errors, warnings } = validateData(data);
if (errors.length) {
  for (const e of errors) console.log(`🔴 ${path.relative(process.cwd(), e.file)}: ${e.message}`);
  console.log(`\nСборка остановлена: ошибок ${errors.length}. Запусти npm run validate для подробностей.`);
  process.exit(1);
}

const storiesDir = path.join(dir, 'stories');
const stories = Object.fromEntries(data.stories.map((id) => [id, fs.readFileSync(path.join(storiesDir, `${id}.md`), 'utf8')]));
// рассказы «Что мы узнали» — по одному файлу на человека, имя файла = id человека
const researchDir = path.join(storiesDir, 'research');
const research = fs.existsSync(researchDir)
  ? Object.fromEntries(fs.readdirSync(researchDir).filter((f) => f.endsWith('.md')).map((f) => [f.slice(0, -3), fs.readFileSync(path.join(researchDir, f), 'utf8')]))
  : {};
for (const id of Object.keys(research)) if (!data.people.some((x) => x.record?.id === id)) console.log(`⚠️  stories/research/${id}.md — нет человека с таким id`);
const site = buildSiteData(data, { stories, research, publicBuild });
// Раскладку древа считаем здесь, один раз: подбор порядка по картинке занимает секунды — браузер их не ждёт.
// Без бюджета подбор на семье в сотни человек не заканчивается вовсе.
const L = layoutTree(site.people, site.meta.root, { budgetMs: 10000 });
site.layout = { ...L, nodes: [...L.nodes.values()] };

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(site, null, 1), 'utf8');

if (fs.existsSync(path.join(dir, 'research', 'questions.yaml')))
  fs.writeFileSync(path.join(dir, 'research', 'questions.md'), questionsMarkdown(site.questions), 'utf8');

const mediaSrc = path.join(dir, 'media');
if (fs.existsSync(mediaSrc)) fs.cpSync(mediaSrc, path.join(path.dirname(outFile), 'media'), { recursive: true });
const privateSrc = path.join(dir, 'private');
const privateOut = path.join(path.dirname(outFile), 'private');
fs.rmSync(privateOut, { recursive: true, force: true });
// С 25.10.2026 личные сканы и фото открыты и родным (решение владельца). В выкладку идут только docs, photos и portraits:
// копии веб-страниц и архивные дела (web, archive) — рабочие материалы, на сайте на них ссылок нет.
if (fs.existsSync(privateSrc)) {
  if (!publicBuild) fs.cpSync(privateSrc, privateOut, { recursive: true });
  else for (const sub of ['docs', 'photos', 'portraits']) {
    const from = path.join(privateSrc, sub);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(privateOut, sub), { recursive: true });
  }
}

for (const w of [...warnings.map((w) => w.message), ...site.warnings]) console.log(`⚠️  ${w}`);
const related = site.people.filter((p) => p.relation).length;
console.log(`Готово: ${path.relative(process.cwd(), outFile)} — людей ${site.people.length}, с известным родством ${related}, мест ${site.places.length}.`);
