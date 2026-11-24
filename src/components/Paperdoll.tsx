// Кукла экипировки: девять слотов 3×3, справа оружие списком и инвентарь ячейками. Пустой слот
// показывается всегда — утопленный, серый, с иконкой слота: мастер видит, чего на персонаже нет.
// Редкий предмет — золотом, и не только цветом: у иконки золотой тон, а в углу квадратная метка.
// Данных экипировки в State пока нет (HANDOFF §7): компонент тупой, из листа персонажа собирается
// только доспех и щит (dollItemsOf); оружие и инвентарь придут пропсами, когда поле появится.
import type { CharacterSheet } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { ARMOR, SHIELD, isArmorId } from '../rules/srd';
import { SemanticMark } from '../art/SemanticMark';
import { EQUIPMENT_SLOT_ART } from '../art/semanticBindings';

export const SLOT_IDS = ['head', 'neck', 'cloak', 'armor', 'hands', 'ring', 'belt', 'feet', 'weapon'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/** Порядок сетки — как в прототипе: три ряда сверху вниз. Иконки slot-* есть в наборе для всех девяти. */
export const SLOTS: Readonly<Record<SlotId, { label: string; icon: IconName }>> = {
  head: { label: 'Голова', icon: 'slot-head' },
  neck: { label: 'Шея', icon: 'slot-neck' },
  cloak: { label: 'Плащ', icon: 'slot-cloak' },
  armor: { label: 'Доспех', icon: 'slot-armor' },
  hands: { label: 'Кисти', icon: 'slot-hands' },
  ring: { label: 'Кольцо', icon: 'slot-ring' },
  belt: { label: 'Пояс', icon: 'slot-belt' },
  feet: { label: 'Ноги', icon: 'slot-feet' },
  weapon: { label: 'Оружие', icon: 'slot-weapon' },
};

export interface SlotItem {
  name: string;
  /** Короткая заметка в тултип: «слот шеи», «щит». */
  note?: string;
  /** Редкий и выше — золотой акцент. */
  rare?: boolean;
}

export interface Weapon {
  name: string;
  /** Бонус к попаданию со знаком: «+9». */
  hit: string;
  /** Кость урона: «1d8+5». */
  dmg: string;
}

export interface InventoryItem {
  name: string;
  icon?: IconName;
}

export interface PaperdollProps {
  items?: Partial<Record<SlotId, SlotItem>>;
  weapons?: readonly Weapon[];
  /** Ячейки инвентаря по порядку; null — пустая ячейка, она рисуется. */
  inventory?: readonly (InventoryItem | null)[];
  onSlot?: (id: SlotId) => void;
  onAttack?: (weapon: Weapon) => void;
  className?: string;
}

/** Тултип слота: «Шея: Амулет Mielikki · слот шеи» или «Голова: пусто». */
export function slotTitle(id: SlotId, item: SlotItem | undefined): string {
  const label = SLOTS[id].label;
  if (!item) return `${label}: пусто`;
  return `${label}: ${item.name}${item.note ? ` · ${item.note}` : ''}`;
}

/** Тултип оружия: «Длинный лук · +9 к попаданию, 1d8+5». */
export function weaponTitle(w: Weapon): string {
  return `${w.name} · ${w.hit} к попаданию, ${w.dmg}`;
}

/**
 * Из листа персонажа в слоты: только доспех, единственное, что лист хранит. Щит в SRD не слот —
 * идёт заметкой к доспеху; щит без доспеха занимает слот сам. Остальные семь слотов честно пусты.
 */
export function dollItemsOf(sheet: Pick<CharacterSheet, 'armor' | 'shield'> | undefined): Partial<Record<SlotId, SlotItem>> {
  if (!sheet) return {};
  const armor = sheet.armor && isArmorId(sheet.armor) ? ARMOR[sheet.armor] : undefined;
  if (armor) return { armor: { name: armor.name, note: sheet.shield ? `+ ${SHIELD.name}` : undefined } };
  if (sheet.shield) return { armor: { name: SHIELD.name } };
  return {};
}

const SLOT_EMPTY = 'bg-cd shadow-bevel-in text-t3';
const SLOT_FILLED = 'bg-linear-to-b from-pl to-cd shadow-bevel text-t2 hover:shadow-[var(--bevel),inset_0_-2px_0_var(--br)]';
const FOCUS = 'focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const HEAD = 'type-h-15 uppercase text-t2 pb-1 shadow-[inset_0_-1px_0_var(--lo)]';

export function Paperdoll({ items = {}, weapons, inventory, onSlot, onAttack, className = '' }: PaperdollProps) {
  const ws = weapons ?? [];
  const inv = inventory ?? [];
  const hasWeapons = ws.length > 0;
  const hasInventory = inv.length > 0;
  return (
    <div className={`flex flex-wrap items-start gap-4 ${className}`}>
      <div role="group" aria-label="Слоты экипировки" className="grid flex-none grid-cols-[repeat(3,72px)] gap-1">
        {SLOT_IDS.map(id => {
          const slot = SLOTS[id];
          const item = items[id];
          return (
            <button
              key={id}
              type="button"
              data-slot={id}
              data-filled={item ? 'true' : 'false'}
              data-rare={item?.rare ? 'true' : undefined}
              aria-label={slotTitle(id, item)}
              title={slotTitle(id, item)}
              onClick={() => onSlot?.(id)}
              className={`relative flex h-16 cursor-pointer flex-col items-center justify-center gap-1 px-1 py-1 min-w-0 ${item ? SLOT_FILLED : SLOT_EMPTY} ${FOCUS}`}
            >
              {EQUIPMENT_SLOT_ART[slot.icon]
                ? <SemanticMark asset={EQUIPMENT_SLOT_ART[slot.icon]!} icon={slot.icon} size={24} color={item ? (item.rare ? 'var(--gd)' : 'var(--tx)') : 'var(--t3)'} title={slot.label} />
                : <Icon name={slot.icon} size={24} color={item ? (item.rare ? 'var(--gd)' : 'var(--tx)') : 'var(--t3)'} title={slot.label} />}
              <span className="type-body-xs max-w-full truncate">{item ? item.name : slot.label}</span>
              {item?.rare ? (
                <span role="img" aria-label="редкий предмет" title="Редкий предмет" className="absolute top-1 right-1 size-2 bg-gd" />
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Справа, а в узком теле — под сеткой: 52 = ширина ряда инвентаря (8×24 + 7×2), уже него список не читается. */}
      {hasWeapons || hasInventory ? (
        <div className="flex min-w-52 flex-1 flex-col gap-1">
          {hasWeapons ? (
            <>
              <h3 className={HEAD}>Оружие</h3>
              {ws.map(w => (
                <button
                  key={w.name}
                  type="button"
                  title={weaponTitle(w)}
                  onClick={() => onAttack?.(w)}
                  className={`flex cursor-pointer items-center gap-1.5 px-2 py-1 type-body-sm text-tx bg-linear-to-b from-pl to-cd shadow-bevel hover:from-pl hover:to-pl active:shadow-bevel-in ${FOCUS}`}
                >
                  <Icon name="attack" size={16} color="var(--t2)" title="Атака" />
                  <span className="flex-1 min-w-0 truncate text-left">{w.name}</span>
                  <span className="type-num-12 text-gd flex-none" title="К попаданию">{w.hit}</span>
                  <span className="type-num-12 text-t2 flex-none" title="Урон">{w.dmg}</span>
                </button>
              ))}
            </>
          ) : null}
          {hasInventory ? (
            <>
              <h3 className={HEAD}>Инвентарь</h3>
              <div role="group" aria-label="Инвентарь" className="grid grid-cols-[repeat(8,24px)] gap-0.5">
                {inv.map((it, i) => (
                  <span
                    key={i}
                    data-cell={it ? 'item' : 'empty'}
                    title={it ? it.name : 'пусто'}
                    className="flex size-6 items-center justify-center bg-wl shadow-bevel-in"
                  >
                    {it ? <Icon name={it.icon ?? 'ent-item'} size={16} color="var(--t2)" title={it.name} /> : null}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default Paperdoll;
