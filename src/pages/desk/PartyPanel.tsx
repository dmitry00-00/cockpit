// Панель партии слева (HANDOFF §4, F9): горизонтальный ряд портретов, отметки участников, подвал выборки и «Создать персонажа»;
// раскрытая из рейки панель — оверлей над главной зоной. На телефоне переключение остаётся в верхней рейке,
// а карточка открывается нажатием на портрет. Пропсы — те же имена, что на
// странице: компонент — перенос её разметки, состояние держит страница.
import type { Dispatch, SetStateAction } from 'react';
import { mouthsOf, partySummaryOf, sheetViewOf, supplyCapacity, supplyOf } from '../../campaign';
import { PartyPortraits, PartyFooter } from '../../components';
import type { Actor, State, SupplyReason } from '../../engine';
import type { SkillId } from '../../rules/srd/abilities';
import { useHpFlashes } from '../../engine/useEngine';
import { Icon } from '../../icons/Icon';
import type { OpenRail } from './helpers';
import { BTN_HEAD, HEAD, NEW_PC_ROW, PANEL_OVERLAY_LEFT } from './styles';

export interface PartyPanelProps {
  state: State;
  dmView: boolean;
  party: Actor[];
  selectedId: string;
  open: (id: string) => void;
  flashes: ReturnType<typeof useHpFlashes>;
  checkedParty: ReadonlySet<string>;
  setChecked: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setCompareOpen: (open: boolean) => void;
  setEditorOpen: (open: boolean) => void;
  /** Compact management popover over the party row: actions and selection only, no duplicate character spines. */
  compactManager?: boolean;
  onCloseManager?: () => void;
  /** На телефоне выбор персонажа остаётся в горизонтальной рейке; панель нельзя закрепить столбцом. */
  mobile?: boolean;
  railParty: boolean;
  setRailParty: (on: boolean) => void;
  openRail: OpenRail;
  setOpenRail: Dispatch<SetStateAction<OpenRail>>;
  /** Запись припасов партии руками (SUPPLY_CHANGED); съеденное пишут отдых и поход сами. */
  onSupply?: (reason: SupplyReason, amount: number) => void;
  onGroupCheck?: (skill: SkillId, dc: number, members: readonly { actorId: string; name: string; modifier: number }[]) => void;
}

export function PartyPanel({
  state, dmView, party, selectedId, open, flashes, checkedParty, setChecked, setCompareOpen, setEditorOpen, compactManager = false, onCloseManager, mobile = false,
  railParty, setRailParty, openRail, setOpenRail, onSupply, onGroupCheck,
 }: PartyPanelProps) {
  const mobileView = mobile || (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 700px)').matches);
  return (
    <>
      {railParty ? (
        <PartyPortraits
          actors={party}
          worldSec={state.time.sec}
          selectedId={selectedId}
          onOpen={open}
          flash={flashes}
          checkedIds={mobileView && dmView && openRail?.side === 'party' ? checkedParty : undefined}
          onCheck={mobileView && dmView && openRail?.side === 'party' ? id => setChecked(c => { const n = new Set(c); if (!n.delete(id)) n.add(id); return n; }) : undefined}
          panelOpen={openRail?.side === 'party'}
          onPanel={() => setOpenRail(o => (o?.side === 'party' ? null : { side: 'party', item: 'party' }))}
        />
      ) : null}
      {!railParty || openRail?.side === 'party' ? (
      <aside aria-label={compactManager ? 'Управление партией' : 'Партия'} data-overlay={railParty || undefined} className={compactManager ? 'desk-party-manager flex flex-col bg-pn min-h-0' : railParty ? PANEL_OVERLAY_LEFT : 'w-rail-party flex-none flex flex-col bg-pn shadow-bevel min-h-0'}>
        <div className={HEAD}>
          <Icon name="ent-pc" size={16} color="var(--t2)" title={compactManager ? 'Управление партией' : 'Партия'} />
          <span>{compactManager ? 'Управление партией' : 'Партия'}</span>
          <span className="ml-auto type-key text-t2" title="Персонажей в партии">{party.length}</span>
          {compactManager ? <button type="button" title="Закрыть управление партией" onClick={onCloseManager} className={BTN_HEAD}>Закрыть</button> : null}
          {!compactManager && dmView ? (
            <button type="button" title="Новый персонаж из компендиума: раса, класс, point buy, навыки — в партию одним событием" onClick={() => setEditorOpen(true)} className={BTN_HEAD}>Новый</button>
          ) : null}
          {!compactManager && railParty ? (
            <button type="button" title={mobileView ? 'Закрыть панель и оставить горизонтальную полосу портретов' : 'Закрепить панель на столе'} onClick={() => { setRailParty(mobileView); setOpenRail(null); }} className={BTN_HEAD}>{mobileView ? 'Свернуть' : 'Закрепить'}</button>
          ) : !compactManager ? (
            <button type="button" title="Свернуть панель в полосу иконок" onClick={() => { setRailParty(true); if (mobileView) setOpenRail(null); }} className={BTN_HEAD}>Свернуть</button>
          ) : null}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {compactManager ? (
            <p className="px-2 py-2 type-body-xs text-t2">Отметьте участников в строке партии для сравнения и групповых действий.</p>
          ) : mobileView ? (
            <p className="px-3 py-3 type-body-xs text-t2">Переключайтесь между персонажами по горизонтальной полосе портретов сверху. Полная карточка открывается нажатием на портрет.</p>
          ) : <PartyPortraits
            actors={party}
            worldSec={state.time.sec}
            selectedId={selectedId}
            onOpen={open}
            flash={flashes}
            panelOpen
            onPanel={() => {}}
            showPanelToggle={false}
            checkedIds={dmView ? checkedParty : undefined}
            onCheck={dmView ? id => setChecked(c => { const n = new Set(c); if (!n.delete(id)) n.add(id); return n; }) : undefined}
            className="party-panel-portrait-row"
          />}
          {!compactManager && dmView ? (
            <button type="button" title="Экран создания персонажа: имя, раса, класс, умения, заклинания, снаряжение — карточка заполняется по ходу" onClick={() => setEditorOpen(true)} aria-label="Создать персонажа" className={NEW_PC_ROW} data-part="new-pc">
              <Icon name="ent-pc" size={24} color="var(--gd)" title="Новый персонаж" />
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="type-h-17 text-gd truncate">Создать персонажа</span>
                <span className="type-body-xs text-t2 truncate">раса, класс, заклинания, снаряжение</span>
              </span>
            </button>
          ) : null}
        </div>
        {dmView && party.length > 0 ? (
          <PartyFooter
            total={party.length}
            selected={checkedParty.size}
            summary={partySummaryOf(checkedParty.size > 0 ? party.filter(a => checkedParty.has(a.id)) : party)}
            groupMembers={checkedParty.size > 0 ? party.filter(a => checkedParty.has(a.id)).map(a => ({
              id: a.id, name: a.name,
              mods: Object.fromEntries((sheetViewOf(a)?.skills ?? []).map(skill => [skill.id, skill.mod])),
            })) : []}
            onGroupCheck={onGroupCheck}
            onCompare={() => setCompareOpen(true)}
            onClear={() => setChecked(new Set())}
            dmView={dmView}
            renown={Object.values(state.world.factions).filter(f => f.renown !== 0).sort((a, b) => b.renown - a.renown).map(f => ({ id: f.id, name: f.name, value: f.renown }))}
            supply={{ value: supplyOf(state), capacity: supplyCapacity(state), perDay: mouthsOf(state), ...(onSupply ? { onChange: onSupply } : {}) }}
          />
        ) : null}
      </aside>
      ) : null}
    </>
  );
}

export default PartyPanel;
