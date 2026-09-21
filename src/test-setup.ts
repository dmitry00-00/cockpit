import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// globals: false — RTL сам не подписывается на afterEach, без этого рендеры копятся между тестами.
afterEach(cleanup);

// jsdom 26 + nwsapi 2.2.27: floating-ui под Radix Popper (Popover, Tooltip, Dialog) спрашивает у элемента
// `:popover-open` и `:modal`, а nwsapi на них уходит в рекурсию до RangeError — секунды на каждое открытие.
// В браузере этого нет; здесь отвечаем «нет» сразу. Общий сторож для всех тестов с Radix-попперами.
if (typeof Element !== 'undefined') {
  const nativeMatches = Element.prototype.matches;
  Element.prototype.matches = function matches(this: Element, selector: string): boolean {
    return selector === ':popover-open' || selector === ':modal' ? false : nativeMatches.call(this, selector);
  };
}
