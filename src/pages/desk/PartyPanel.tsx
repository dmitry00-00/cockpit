// Панель партии слева (HANDOFF §4, F9): корешки персонажей, отметки строк и подвал выборки, «Создать персонажа»;
// свёрнутая — колонка портретов (аватар, класс, уровень, хиты; щелчок открывает карточку), раскрытая из неё —
// оверлей поверх главной зоны. Пропсы — те же имена, что на
// странице: компонент — перенос её разметки, состояние держит страница.
import type { Dispatch, SetStateAction } from 'react';
import { partySummaryOf } from '../../campaign';
import { PartyPortraits, PartySpine, PartyFooter } from '../../components';
import type { Actor, State } from '../../engine';
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
  railParty: boolean;
  setRailParty: (on: boolean) => void;
  openRail: OpenRail;
  setOpenRail: Dispatch<SetStateAction<OpenRail>>;
}

export function PartyPanel({
  state, dmView, party, selectedId, open, flashes, checkedParty, setChecked, setCompareOpen, setEditorOpen,
  railParty, setRailParty, openRail, setOpenRail,
 }: PartyPanelProps) {
  return (
    <>
      {railParty ? (
        <PartyPortraits
          actors={party}
          worldSec={state.time.sec}
          selectedId={selectedId}
          onOpen={open}
          flash={flashes}
          panelOpen={openRail?.side === 'party'}
          onPanel={() => setOpenRail(o => (o?.side === 'party' ? null : { side: 'party', item: 'party' }))}
        />
      ) : null}
      {!railParty || openRail?.side === 'party' ? (
      <aside aria-label="Партия" data-overlay={railParty || undefined} className={railParty ? PANEL_OVERLAY_LEFT : 'w-rail-party flex-none flex flex-col bg-pn shadow-bevel min-h-0'}>
        <div className={HEAD}>
          <Icon name="ent-pc" size={16} color="var(--t2)" title="Партия" />
          <span>Партия</span>
          <span className="ml-auto type-key text-t2" title="Персонажей в партии">{party.length}</span>
          {dmView ? (
            <button type="button" title="Новый персонаж из компендиума: раса, класс, point buy, навыки — в партию одним событием" onClick={() => setEditorOpen(true)} className={BTN_HEAD}>Новый</button>
          ) : null}
          {railParty ? (
            <button type="button" title="Закрепить панель на столе" onClick={() => { setRailParty(false); setOpenRail(null); }} className={BTN_HEAD}>Закрепить</button>
          ) : (
            <button type="button" title="Свернуть панель в полосу иконок" onClick={() => setRailParty(true)} className={BTN_HEAD}>Свернуть</button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <PartySpine
            actors={party}
            worldSec={state.time.sec}
            selectedId={selectedId}
            onOpen={open}
            flash={flashes}
            locations={state.world.locations}
            checkedIds={dmView ? checkedParty : undefined}
            onCheck={dmView ? id => setChecked(c => { const n = new Set(c); if (!n.delete(id)) n.add(id); return n; }) : undefined}
          />
          {dmView ? (
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
            onCompare={() => setCompareOpen(true)}
            onClear={() => setChecked(new Set())}
            dmView={dmView}
            renown={Object.values(state.world.factions).filter(f => f.renown !== 0).sort((a, b) => b.renown - a.renown).map(f => ({ id: f.id, name: f.name, value: f.renown }))}
          />
        ) : null}
      </aside>
      ) : null}
    </>
  );
}

export default PartyPanel;
