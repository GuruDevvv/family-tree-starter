// Запуск: node scripts/validate.js [папка-данных]   (по умолчанию data/)
// Код выхода 1, если есть ошибки.
import path from 'node:path';
import { loadData } from './lib/load.js';
import { validateData } from './lib/validate.js';

const dir = path.resolve(process.argv[2] || 'data');
const data = loadData(dir);
const { errors, warnings } = validateData(data);
const rel = (f) => path.relative(process.cwd(), f);

for (const w of warnings) console.log(`⚠️  ${rel(w.file)}: ${w.message}`);
for (const e of errors) console.log(`🔴 ${rel(e.file)}: ${e.message}`);
console.log(`\nЛюдей: ${data.people.length}, мест: ${data.places.length}, источников: ${data.sources.length}. ` +
  `Ошибок: ${errors.length}, предупреждений: ${warnings.length}.`);
process.exit(errors.length ? 1 : 0);
