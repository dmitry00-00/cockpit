import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { dayPhase, seedState, weatherOf } from '../../campaign';
import * as calendarModule from '../../campaign/calendar';
import type { CalendarAdapter } from '../../campaign/calendar';
import { OpenEntityContext } from '../../components/openEntity';
import { ClockBar } from './ClockBar';

function RestClockHarness({ onRest, campaignYear = 1492 }: { onRest: ReturnType<typeof vi.fn>; campaignYear?: number | null }) {
  const state = seedState();
  const [restOpen, setRestOpen] = useState(false);
  return <ClockBar
    railParty={false} state={state} encounter={state.encounter} phase={dayPhase(state.time.sec)} narrow={false}
    weather={weatherOf(state.time.sec)} combat={false} views={['desk']} shownView="desk"
    setView={vi.fn()} dmView initiativeOpen={false} setInitiativeOpen={vi.fn()} initiativeRows={[]} rollTotal={() => 10}
    applyInitiative={vi.fn()} restOpen={restOpen} setRestOpen={setRestOpen}
    restRows={[{ id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 8, max: 8, temp: 0 }, conMod: 1 }]}
    supplyAvailable={0} restLayer="srd" onRestLayerChange={vi.fn()} nowSec={state.time.sec} onA5eTrackSet={vi.fn()}
    onRest={onRest} tempo="hour" campaignYear={campaignYear} ringYear={campaignYear} onRingYearChange={vi.fn()} recommendedTempo="day"
    setTempoChoice={vi.fn()} onStep={vi.fn()} onStepAtTempo={vi.fn()} setPlayersView={vi.fn()}
  />;
}

describe('ClockBar modal', () => {
  it('opens the calendar and time controls in a modal and restores focus on Escape', async () => {
    const state = seedState();
    render(<ClockBar
      railParty={false}
      state={state}
      encounter={state.encounter}
      phase={dayPhase(state.time.sec)}
      narrow={false}
      weather={weatherOf(state.time.sec)}
      combat={false}
      views={['desk']}
      shownView="desk"
      setView={vi.fn()}
      dmView
      initiativeOpen={false}
      setInitiativeOpen={vi.fn()}
      initiativeRows={[]}
      rollTotal={() => 10}
      applyInitiative={vi.fn()}
      restOpen={false}
      setRestOpen={vi.fn()}
      restRows={[]}
      supplyAvailable={0}
      restLayer="srd"
      onRestLayerChange={vi.fn()}
      nowSec={state.time.sec}
      onA5eTrackSet={vi.fn()}
      onRest={vi.fn()}
      tempo="hour"
      campaignYear={1492}
      ringYear={1492}
      onRingYearChange={vi.fn()}
      recommendedTempo="day"
      setTempoChoice={vi.fn()}
      onStep={vi.fn()}
      onStepAtTempo={vi.fn()}
      setPlayersView={vi.fn()}
    />);

    const trigger = screen.getByRole('button', { name: 'Управление временем' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Управление временем' });
    expect(await screen.findByRole('group', { name: 'Темп времени' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Календарь Харптоса' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Часы Харптоса' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Астролябия' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Песочные часы' })).toBeNull();
    expect(screen.getByRole('img', { name: /Время суток:/ })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Управление временем' })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes the time modal before opening a calendar entity through the parent callback', async () => {
    const state = seedState();
    const parentOpen = vi.fn();
    render(<OpenEntityContext.Provider value={parentOpen}><ClockBar
      railParty={false}
      state={state}
      encounter={state.encounter}
      phase={dayPhase(state.time.sec)}
      narrow={false}
      weather={weatherOf(state.time.sec)}
      combat={false}
      views={['desk']}
      shownView="desk"
      setView={vi.fn()}
      dmView
      initiativeOpen={false}
      setInitiativeOpen={vi.fn()}
      initiativeRows={[]}
      rollTotal={() => 10}
      applyInitiative={vi.fn()}
      restOpen={false}
      setRestOpen={vi.fn()}
      restRows={[]}
      supplyAvailable={0}
      restLayer="srd"
      onRestLayerChange={vi.fn()}
      nowSec={state.time.sec}
      onA5eTrackSet={vi.fn()}
      onRest={vi.fn()}
      tempo="hour"
      campaignYear={1492}
      ringYear={1492}
      onRingYearChange={vi.fn()}
      recommendedTempo="day"
      setTempoChoice={vi.fn()}
      onStep={vi.fn()}
      onStepAtTempo={vi.fn()}
      setPlayersView={vi.fn()}
    /></OpenEntityContext.Provider>);

    fireEvent.click(screen.getByRole('button', { name: 'Управление временем' }));
    const dialog = await screen.findByRole('dialog', { name: 'Управление временем' });
    const calendar = await screen.findByRole('region', { name: 'Календарь Харптоса' });
    fireEvent.click(within(calendar).getByRole('button', { name: 'Faerûn' }));
    fireEvent.click(within(calendar).getByRole('button', { name: 'Следующий месяц' }));
    fireEvent.click(within(calendar).getByRole('button', { name: 'Kythorn' }));
    fireEvent.click(within(calendar).getByRole('list', { name: 'Святые дни: Kythorn' }).querySelector('button[title*="Amaunator"]')!);

    expect(parentOpen).toHaveBeenCalledWith('deity:amaunator');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Управление временем' })).toBeNull());
    expect(dialog).not.toBeVisible();
  });

  it('opens the astrolabe with a year lens while keeping the campaign clock untouched', async () => {
    const state = seedState();
    const setLens = vi.fn();
    render(<ClockBar
      railParty={false}
      state={state}
      encounter={state.encounter}
      phase={dayPhase(state.time.sec)}
      narrow={false}
      weather={weatherOf(state.time.sec)}
      combat={false}
      views={['desk']}
      shownView="desk"
      setView={vi.fn()}
      dmView
      initiativeOpen={false}
      setInitiativeOpen={vi.fn()}
      initiativeRows={[]}
      rollTotal={() => 10}
      applyInitiative={vi.fn()}
      restOpen={false}
      setRestOpen={vi.fn()}
      restRows={[]}
      supplyAvailable={0}
      restLayer="srd"
      onRestLayerChange={vi.fn()}
      nowSec={state.time.sec}
      onA5eTrackSet={vi.fn()}
      onRest={vi.fn()}
      tempo="hour"
      campaignYear={1492}
      ringYear={1491}
      onRingYearChange={setLens}
      recommendedTempo="day"
      setTempoChoice={vi.fn()}
      onStep={vi.fn()}
      onStepAtTempo={vi.fn()}
      setPlayersView={vi.fn()}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Управление временем' }));
    await screen.findByRole('dialog', { name: 'Управление временем' });
    fireEvent.click(screen.getByRole('button', { name: 'Астролябия' }));
    const instrument = await screen.findByLabelText('Астролябия мирового времени');
    await waitFor(() => expect(instrument.querySelector('[data-part="astrolabe"]')).toHaveAttribute('data-ring-year', '1491'));
    expect(screen.getByRole('spinbutton', { name: 'Год линзы карты и карточек' })).toHaveValue(1491);
    expect(screen.getByRole('button', { name: 'К году кампании' })).toBeInTheDocument();
    expect(state.time.sec).toBe(seedState().time.sec);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Год линзы карты и карточек' }), { target: { value: '1490' } });
    expect(setLens).toHaveBeenCalledWith(1490);
    expect(state.time.sec).toBe(seedState().time.sec);
  });

  it('keeps the existing rest form available with the Harptos clock and uses the same callback', async () => {
    const onRest = vi.fn();
    render(<RestClockHarness onRest={onRest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Управление временем' }));
    const dialog = await screen.findByRole('dialog', { name: 'Управление временем' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отдых' }));
    await within(dialog).findByRole('radiogroup', { name: 'Вид отдыха' });
    fireEvent.click(screen.getByRole('button', { name: 'Отдохнуть' }));
    expect(onRest).toHaveBeenCalledWith('short', ['bo'], [], { layer: 'srd', haven: false });
    expect(within(dialog).queryByRole('radiogroup', { name: 'Вид отдыха' })).toBeNull();
  });

  it('shows a yearless calendar without a fake DR year, Harptos calendar, or astrolabe', async () => {
    const state = seedState();
    const base = calendarModule.calendarAdapterForState(state);
    const counter: CalendarAdapter = {
      ...base, id: 'planet-days', kind: 'counter', yearAt: () => null, yearSuffix: undefined,
      formatDate: () => 'День 1, 00:00', formatDateOnly: () => 'День 1', formatCompactDate: () => 'День 1',
      formatTime: () => '00:00', moonAt: undefined, seasonAt: undefined,
    };
    const spy = vi.spyOn(calendarModule, 'calendarAdapterForState').mockReturnValue(counter);
    const view = render(<RestClockHarness onRest={vi.fn()} campaignYear={null} />);
    try {
      const trigger = screen.getByRole('button', { name: 'Управление временем' });
      expect(trigger).toHaveAttribute('title', expect.stringContaining('День 1, 00:00'));
      fireEvent.click(trigger);
      await screen.findByRole('dialog', { name: 'Управление временем' });
      expect(screen.getByRole('region', { name: 'Календарь сеттинга' })).toHaveTextContent('День 1, 00:00');
      expect(screen.getByRole('region', { name: 'Календарь сеттинга' })).toHaveTextContent('нет года');
      expect(screen.queryByRole('region', { name: 'Календарь Харптоса' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Астролябия' })).toBeNull();
      expect(screen.queryByText(/0 DR|1492 DR/)).toBeNull();
    } finally {
      view.unmount();
      spy.mockRestore();
    }
  });
});
