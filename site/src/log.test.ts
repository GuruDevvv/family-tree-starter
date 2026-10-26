import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { logGroups, logHtml } from './log';
import { personLogCount } from './people';
import type { SiteData } from './types';

const real = path.resolve(__dirname, '../public/data.json');

describe('журнал поиска', () => {
  it.skipIf(!fs.existsSync(real))('каждая запись журнала попадает на страницу, каждый умерший предок — в «искали» или «ещё не искали»', () => {
    const data = JSON.parse(fs.readFileSync(real, 'utf8')) as SiteData;
    const { entries, people, notSearched, general } = logGroups(data);
    const shown = new Set([...people.flatMap((p) => entries.get(p.id)!), ...general]);
    expect(shown.size).toBe(data.searchLog!.length);
    const ancestors = data.people.filter((p) => p.ahnentafel && p.ahnentafel > 1 && !p.living).map((p) => p.id).sort();
    const covered = [...people.map((p) => p.id), ...notSearched.map((p) => p.id)].filter((id) => ancestors.includes(id)).sort();
    expect(covered).toEqual(ancestors);
    const html = logHtml(data);
    expect(html.split('class="lg-e"').length - 1).toBeGreaterThanOrEqual(data.searchLog!.length);
    expect(html.split('class="lg-r"').length - 1).toBe(data.requests?.length ?? 0);
    // у каждой кнопки панели есть раздел, к которому она ведёт
    const goes = [...html.matchAll(/data-go="([^"]+)"/g)].map((m) => m[1]);
    expect(goes.length).toBeGreaterThanOrEqual(people.length);
    for (const g of goes) expect(html).toContain(`data-sec="${g}"`);
  });

  it.skipIf(!fs.existsSync(real))('журнал по человеку: все его поиски и письма, и ничего чужого', () => {
    const data = JSON.parse(fs.readFileSync(real, 'utf8')) as SiteData;
    for (const p of data.people) {
      const n = personLogCount(data, p.id);
      if (!n) continue;
      const html = logHtml(data, p.id);
      const shown = html.split('class="lg-e"').length - 1 + html.split('class="lg-r"').length - 1;
      expect(shown, p.id).toBe(n);
      expect(html).toContain('href="#log"');
    }
  });
});
