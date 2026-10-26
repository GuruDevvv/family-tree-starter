// Чек-лист для родных: data/research/questions.md собирается из questions.yaml при каждой сборке.

const GROUPS = [
  ['papa', 'Папе (Якову Владимировичу)'],
  ['mama', 'Маме (Марине Феликсовне)'],
  ['search', 'Выяснить поиском'],
  ['other', 'Другое'],
];

export function questionsMarkdown(questions) {
  let md = '# Открытые вопросы\n\n' +
    'Что спросить у родных и что выяснить поиском.\n' +
    'Файл собирается из `questions.yaml` командой `npm run build:data` — править там, а не здесь.\n';
  for (const [ask, title] of GROUPS) {
    const open = questions.filter((q) => q.ask === ask && q.status !== 'answered');
    if (!open.length) continue;
    md += `\n## ${title}\n` + open.map((q) => `- ${q.text}\n`).join('');
  }
  const done = questions.filter((q) => q.status === 'answered');
  if (done.length) md += '\n## Отвечено\n' + done.map((q) => `- ~~${q.text}~~${q.answer ? ` — ${q.answer}` : ''}\n`).join('');
  return md;
}
