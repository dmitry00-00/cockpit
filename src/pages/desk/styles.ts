// Классы разметки стола, общие для его частей: шапка секции, кнопки, переключатели, оверлеи панелей.
import { type Sky } from '../../campaign';
import { CONCENTRATION_DURATIONS, type MoonPhase } from '../../components';
import { type IconName } from '../../icons/Icon';

/* ---------- Мелкая разметка стола ---------- */

export const HEAD = 'flex items-center gap-2 h-7 px-2 flex-none bg-linear-to-b from-pl to-cd shadow-plate type-h-15 uppercase text-t2 whitespace-nowrap';
export const VIEW_LABEL = { desk: 'Стол', time: 'Время', pulse: 'Пульс', chrono: 'Хроника', journal: 'Журнал', notebook: 'Тетрадь' } as const;
/** Вид главной зоны: стол, время, пульс мира и хроника канона (только мастеру), журнал, тетрадь партии (Д6). */
export type DeskView = keyof typeof VIEW_LABEL;
export const VIEW_ICON = { desk: 'map', time: 'tempo', pulse: 'pulse', chrono: 'skill-history', journal: 'journal', notebook: 'note' } as const satisfies Record<keyof typeof VIEW_LABEL, IconName>;
export const VIEW_TITLE = { desk: 'Стол: карточка или поле боя · Esc', time: 'Шаг времени и сводка «что изменилось» · T делает шаг', pulse: 'Пульс мира: календарь, фракции, цены, встречи · W', chrono: 'Хроника канона: события по годам, слепок мира на год · H', journal: 'Журнал сессии · J', notebook: 'Тетрадь партии: что игроки узнали, когда и кто · N' } as const;
export const MOON_PHASES: readonly MoonPhase[] = ['new', 'waxing', 'full', 'waning'];
/** Иконка неба — из набора погоды генератора; у каждой title, подпись рядом словами. */
export const SKY_ICON: Readonly<Record<Sky, IconName>> = { clear: 'day', cloudy: 'cloudy', rain: 'rain', storm: 'storm' };
export const BTN = 'type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
export const OPT = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd';
export const OPT_OFF = 'text-t2 shadow-bevel hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
export const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';

/** Сроки состояний из сетки — те же ступени, что у концентрации, но по умолчанию «без срока». */
export const CONDITION_DURATIONS = [{ sec: 0, label: 'без срока' }, ...CONCENTRATION_DURATIONS.filter(d => d.sec > 0)] as const;
/* Кнопка в шапке-плите: без своей плиты, подпись как у шапки; наведение — текст. */
/** Переключатель вида: нажатая — золотом снизу, как у кнопок карты. */
export const BTN_TOGGLE = `${BTN} aria-pressed:text-gd-hi aria-pressed:shadow-[var(--bevel),inset_0_-2px_0_var(--gd)]`;
export const BTN_HEAD = 'type-key uppercase px-1 text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--glow-gold)]';
/* Строка «Создать персонажа» под корешками партии: та же высота и плита, что у корешка, золотая подпись — заметный вход в редактор. */
export const NEW_PC_ROW = 'flex w-full items-center gap-3 px-3 py-3 text-left cursor-pointer bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_3px_0_0_var(--gd)] hover:from-pl hover:to-pl active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
/* F9: панель, раскрытая из полосы иконок, — оверлей поверх главной зоны у своей полосы; float — единственная внешняя тень. */
export const PANEL_OVERLAY_LEFT = 'absolute inset-y-0 left-rail-portraits z-10 w-rail-party flex flex-col bg-pn shadow-float min-h-0';
export const PANEL_OVERLAY_RIGHT = 'absolute inset-y-0 right-10 z-10 w-rail-tools flex flex-col bg-pn shadow-float min-h-0';
