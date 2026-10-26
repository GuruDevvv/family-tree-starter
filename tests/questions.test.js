import { describe, it, expect } from 'vitest';
import { questionsMarkdown } from '../scripts/lib/questions.js';

describe('вопросы к родным', () => {
  it('группирует по адресату, отвеченное — зачёркнутым в конце', () => {
    const md = questionsMarkdown([
      { ask: 'mama', about: ['x'], text: 'Где родилась бабушка?', status: 'open' },
      { ask: 'papa', about: ['y'], text: 'Что значит «Г. Пивек»?', status: 'open' },
      { ask: 'papa', about: ['y'], text: 'Год рождения деда?', status: 'answered', answer: '1939' },
    ]);
    expect(md.indexOf('## Папе')).toBeLessThan(md.indexOf('## Маме'));
    expect(md).toContain('- Что значит «Г. Пивек»?');
    expect(md).toContain('~~Год рождения деда?~~ — 1939');
    expect(md).not.toContain('## Выяснить поиском');
  });
});
