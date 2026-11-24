import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('packages/planetos/package.json', 'utf8'));
const bookBySlug = new Map([
  ['A_Game_of_Thrones', 'agot'],
  ['A_Clash_of_Kings', 'acok'],
  ['A_Storm_of_Swords', 'asos'],
  ['A_Feast_for_Crows', 'affc'],
  ['A_Dance_with_Dragons', 'adwd'],
]);
const bookByTitle = new Map([
  ['A Game of Thrones', 'agot'],
  ['A Clash of Kings', 'acok'],
  ['A Storm of Swords', 'asos'],
  ['A Feast for Crows', 'affc'],
  ['A Dance with Dragons', 'adwd'],
]);

let located = 0;
let unresolved = [];
for (const layer of manifest.layers.filter(item => item.kinds.includes('event'))) {
  const document = JSON.parse(fs.readFileSync(layer.path, 'utf8'));
  let changed = false;
  for (const entity of document.entities ?? []) {
    const source = entity.source;
    if (!source || (source.bookId && Number.isInteger(source.chapterNo))) {
      if (source?.bookId && Number.isInteger(source.chapterNo)) located++;
      continue;
    }

    let bookId;
    let chapterNo;
    const url = source.url ?? '';
    const chapterPage = url.match(/\/([A-Z][A-Za-z_]+)-Chapter_(\d+)(?:[/?#]|$)/);
    if (chapterPage && bookBySlug.has(chapterPage[1])) {
      bookId = bookBySlug.get(chapterPage[1]);
      chapterNo = Number(chapterPage[2]);
    } else if (/\/A_Game_of_Thrones-Prologue(?:[/?#]|$)/.test(url)) {
      bookId = 'agot';
      chapterNo = 0;
    } else {
      const title = (entity.subtitle ?? '').split(' · ')[0].trim();
      const citedChapter = source.cite?.match(/\b(?:AWOIAF\s+)?Chapter_(\d+)\b/i);
      if (citedChapter && bookByTitle.has(title)) {
        bookId = bookByTitle.get(title);
        chapterNo = Number(citedChapter[1]);
      }
    }

    if (!bookId || !Number.isInteger(chapterNo)) {
      unresolved.push(entity.ref);
      continue;
    }
    source.bookId = bookId;
    source.chapterNo = chapterNo;
    changed = true;
    located++;
  }
  if (changed) fs.writeFileSync(layer.path, `${JSON.stringify(document, null, 2)}\n`);
}

console.log(JSON.stringify({ located, unresolved }, null, 2));
