import { describe, expect, it } from 'vitest';
import { PACK } from './packs/rules';

describe('E7: карточки предметов из инвентаря', () => {
  it('собирает SRD-снаряжение и магические предметы в существующие карточки с источником', () => {
    expect(PACK.resolve('item', 'longbow')).toMatchObject({
      ref: 'item:longbow', kind: 'item', name: 'Longbow', source: { kind: 'srd' },
    });
    expect(PACK.resolve('item', 'amulet-of-health')).toMatchObject({
      ref: 'item:amulet-of-health', kind: 'item', name: 'Amulet of Health', source: { kind: 'srd' },
    });
  });
});
