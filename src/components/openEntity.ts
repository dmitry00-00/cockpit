// Вход «открыть карточку по ссылке» для любого компонента (ROADMAP 0.3): страница кладёт колбэк в контекст,
// компонент с ссылкой показывает кнопку «Карточка». Это колбэк, а не данные: компоненты по-прежнему стор не читают.
import { createContext, useContext } from 'react';
import type { EntityRef } from '../entities';

export const OpenEntityContext = createContext<((ref: EntityRef) => void) | null>(null);

export const useOpenEntity = () => useContext(OpenEntityContext);
