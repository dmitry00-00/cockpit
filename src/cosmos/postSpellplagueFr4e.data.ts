import type { PostSpellplagueModel } from './postSpellplagueFr4e.types';

const source = 'Forgotten Realms Campaign Guide, 4e, pp. 60–69';
const sourceUrl = 'https://theberserker.net/restricted/DnD/4E_Forgotten_Realms_CG.pdf';

/**
 * A self-contained, book-scoped cosmology record. This is a 1479 DR snapshot;
 * 1385 DR marks the Spellplague event, not a boundary of the model's validity.
 */
export const POST_SPELLPLAGUE_FR4E: PostSpellplagueModel = {
  title: 'FR 4e post-Spellplague · Axis-compatible',
  edition: 'Forgotten Realms, 4-я редакция',
  sourceSlice: 'Срез книги: 1479 DR',
  contextNote: '1385 DR — год события Spellplague; это не граница «истинности» модели.',
  source,
  sourceUrl,
  nodes: [
    {
      id: 'material-worlds', name: 'Материальный мир\nToril + Abeir',
      summary: 'Руководство описывает послепламенный мир Торила и Абеир; здесь они показаны в одной материальной области схемы.',
      source, sourceUrl, x: 500, y: 340, width: 300, height: 88, kind: 'world',
    },
    {
      id: 'feywild', name: 'Feywild',
      summary: 'Отражение материального мира на стороне Feywild.',
      source, sourceUrl, x: 190, y: 340, width: 180, height: 62, kind: 'reflection',
    },
    {
      id: 'shadowfell', name: 'Shadowfell',
      summary: 'Отражение материального мира на стороне Shadowfell.',
      source, sourceUrl, x: 810, y: 340, width: 180, height: 62, kind: 'reflection',
    },
    {
      id: 'astral-sea', name: 'Астральное море · Astral Sea',
      summary: 'Транзитная область над материальным миром; в ней расположены божественные доминионы.',
      source, sourceUrl, x: 500, y: 128, width: 700, height: 138, kind: 'transitive',
    },
    {
      id: 'divine-dominions', name: 'Божественные доминионы',
      summary: 'Божественные доминионы находятся внутри Astral Sea.',
      source, sourceUrl, x: 500, y: 130, width: 300, height: 48, kind: 'divine',
    },
    {
      id: 'elemental-chaos', name: 'Элементальный Хаос\nElemental Chaos',
      summary: 'Стихийная область под материальным миром.',
      source, sourceUrl, x: 500, y: 530, width: 440, height: 88, kind: 'elemental',
    },
    {
      id: 'abyss', name: 'Бездна · Abyss',
      summary: 'Бездна расположена у основания Elemental Chaos.',
      source, sourceUrl, x: 500, y: 650, width: 240, height: 58, kind: 'abyss',
    },
  ],
  links: [
    {
      id: 'world-astral', from: 'material-worlds', to: 'astral-sea', label: 'над миром',
      summary: 'Astral Sea показано над материальным миром.', source, sourceUrl, style: 'solid',
    },
    {
      id: 'world-feywild', from: 'material-worlds', to: 'feywild', label: 'отражение',
      summary: 'Feywild примыкает к материальному миру как его отражение.', source, sourceUrl, style: 'reflection',
    },
    {
      id: 'world-shadowfell', from: 'material-worlds', to: 'shadowfell', label: 'отражение',
      summary: 'Shadowfell примыкает к материальному миру как его отражение.', source, sourceUrl, style: 'reflection',
    },
    {
      id: 'world-chaos', from: 'material-worlds', to: 'elemental-chaos', label: 'под миром',
      summary: 'Elemental Chaos показан под материальным миром.', source, sourceUrl, style: 'solid',
    },
    {
      id: 'chaos-abyss', from: 'elemental-chaos', to: 'abyss', label: 'основание',
      summary: 'Abyss расположена у основания Elemental Chaos.', source, sourceUrl, style: 'solid',
    },
    {
      id: 'dominions-in-astral', from: 'astral-sea', to: 'divine-dominions', label: 'внутри',
      summary: 'Божественные доминионы находятся внутри Astral Sea.', source, sourceUrl, style: 'containment',
    },
  ],
};
