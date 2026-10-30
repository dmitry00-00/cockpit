// Ретранслятор моста к MapTool (Q17) на сервере стола: MapTool и страница стола не видят друг друга, оба ходят
// сюда. Аддон MapTool раз в секунду шлёт токены текущей карты и получает, что на них нарисовать; страница опрашивает
// токены и кладёт свой вид. Хранится только последнее — в памяти процесса, не на диске: правда клеток — лог стола
// (TOKEN_MOVED), правда хитов — тоже он. Перезапуск сервера ничего не теряет: следующий опрос всё восстановит.
// Без импортов вовсе — подключает vite.config.ts (его проверка типов не должна тянуть за собой движок), тестирует vitest.
// Здесь же — форма данных на проводе; сопоставление с актёрами — bridge.ts.

/** Токен на текущей карте MapTool, как его прислал аддон: id токена MapTool, имя и клетка сетки. */
export interface VttToken { id: string; name: string; x: number; y: number }

/** Что нарисовать на токене MapTool. Состояния — английские имена состояний кампании MapTool. */
export interface VttTokenView {
  tokenId: string;
  hp: { current: number; max: number; temp: number };
  states: readonly string[];
}

/**
 * Вид стола для аддона. managed — все имена состояний, которыми стол управляет: включённые — у токена в states,
 * остальные из списка аддон гасит. rev ставит ретранслятор — запуск сервера и номер правки: аддон помнит последний
 * применённый и не перерисовывает то же самое; ни перезагрузка страницы, ни перезапуск сервера старый номер не повторят.
 */
export interface DeskView { rev: string; tokens: readonly VttTokenView[]; managed: readonly string[] }

/** Что видит страница стола. seq растёт, только когда снимок токенов поменялся. */
export interface DeskPoll { seq: number; tokens: readonly VttToken[] | null; map: string | null; seenMsAgo: number | null }

/** Тишина дольше этого — MapTool не на связи (аддон шлёт раз в секунду). */
export const MAPTOOL_STALE_MS = 5000;

const isToken = (t: unknown): t is VttToken => {
  const o = t as VttToken;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && Number.isInteger(o.x) && Number.isInteger(o.y);
};

export class VttRelay {
  private tokens: VttToken[] | null = null;
  private map: string | null = null;
  private seq = 0;
  private seenAt: number | null = null;
  private readonly boot: string;
  private edits = 0;
  private view: DeskView;

  constructor(now: number) {
    this.boot = now.toString(36);
    this.view = { rev: `${this.boot}-0`, tokens: [], managed: [] };
  }

  /** Аддон MapTool: токены текущей карты → вид стола. Мусор в теле — ошибка с причиной, снимок не трогается. */
  maptoolSync(body: unknown, now: number): DeskView {
    const b = body as { tokens?: unknown; map?: unknown };
    if (!b || !Array.isArray(b.tokens) || !b.tokens.every(isToken)) throw new Error('ожидалось { tokens: [{ id, name, x, y }] }');
    const next = b.tokens.map(t => ({ id: t.id, name: t.name, x: t.x, y: t.y }));
    const map = typeof b.map === 'string' ? b.map : null;
    if (JSON.stringify(next) !== JSON.stringify(this.tokens) || map !== this.map) {
      this.tokens = next;
      this.map = map;
      this.seq += 1;
    }
    this.seenAt = now;
    return this.view;
  }

  /** Страница стола: последний снимок MapTool и давность связи. */
  deskPoll(now: number): DeskPoll {
    return { seq: this.seq, tokens: this.tokens, map: this.map, seenMsAgo: this.seenAt === null ? null : now - this.seenAt };
  }

  /** Страница стола кладёт вид; новый номер правки — только если вид поменялся. */
  deskView(body: unknown): DeskView {
    const b = body as Omit<DeskView, 'rev'>;
    if (!b || !Array.isArray(b.tokens) || !Array.isArray(b.managed)) throw new Error('ожидалось { tokens, managed }');
    const same = JSON.stringify([b.tokens, b.managed]) === JSON.stringify([this.view.tokens, this.view.managed]);
    if (!same) this.view = { rev: `${this.boot}-${++this.edits}`, tokens: b.tokens, managed: b.managed };
    return this.view;
  }
}
