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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isToken = (t: unknown): t is VttToken => {
  const o = t as VttToken;
  return isRecord(t) && typeof o.id === 'string' && o.id.length > 0
    && typeof o.name === 'string' && o.name.length > 0
    && Number.isSafeInteger(o.x) && Number.isSafeInteger(o.y);
};

const isTokenView = (value: unknown): value is VttTokenView => {
  if (!isRecord(value)) return false;
  const token = value as unknown as VttTokenView;
  return typeof token.tokenId === 'string' && token.tokenId.length > 0
    && isRecord(token.hp)
    && Number.isSafeInteger(token.hp.current) && token.hp.current >= 0
    && Number.isSafeInteger(token.hp.max) && token.hp.max >= 0
    && Number.isSafeInteger(token.hp.temp) && token.hp.temp >= 0
    && Array.isArray(token.states) && token.states.every(state => typeof state === 'string' && state.length > 0);
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
    if (new Set(next.map(token => token.id)).size !== next.length) throw new Error('id токенов MapTool должны быть уникальны');
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
    if (!isRecord(body) || !Array.isArray(b.tokens) || !b.tokens.every(isTokenView)
      || !Array.isArray(b.managed) || !b.managed.every(state => typeof state === 'string' && state.length > 0)) {
      throw new Error('ожидалось { tokens: [{ tokenId, hp, states }], managed: string[] }');
    }
    const tokenIds = b.tokens.map(token => token.tokenId);
    if (new Set(tokenIds).size !== tokenIds.length) throw new Error('id токенов вида стола должны быть уникальны');
    if (new Set(b.managed).size !== b.managed.length) throw new Error('управляемые состояния должны быть уникальны');
    const managed = new Set(b.managed);
    if (b.tokens.some(token => new Set(token.states).size !== token.states.length || token.states.some(state => !managed.has(state)))) {
      throw new Error('состояния токена должны быть уникальными и входить в managed');
    }
    const same = JSON.stringify([b.tokens, b.managed]) === JSON.stringify([this.view.tokens, this.view.managed]);
    if (!same) this.view = { rev: `${this.boot}-${++this.edits}`, tokens: b.tokens, managed: b.managed };
    return this.view;
  }
}
