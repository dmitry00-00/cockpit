// TensionList: строка — вес, заголовок, вид; щелчок раскрывает факты ссылками и стороны; «Сделать нитью» отдаёт
// напряжение; уже нить или во входящих — кнопка выключена и подписана; без onThread — кнопки нет; пусто — ничего.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tension } from '../campaign/tensions';
import { TensionList } from './TensionList';

const T: Tension = {
  id: 'rivals:p:a|b', kind: 'rivals', title: 'A и B · Town', placeId: 'p', placeName: 'Town', weight: 3,
  sides: [{ label: 'A', ref: 'organization:a' }, { label: 'B', ref: 'organization:b' }],
  facts: [
    { text: 'A: база — Town', ref: 'organization:a', origin: 'wiki' },
    { text: 'B: база — Town', ref: 'organization:b', origin: 'wiki' },
    { text: 'Агент B в Town', origin: 'campaign', factId: 'f1' },
  ],
};

describe('TensionList', () => {
  it('вес, заголовок и вид; факты раскрываются; ссылка открывает карточку', () => {
    const onOpen = vi.fn();
    render(<TensionList tensions={[T]} onOpen={onOpen} />);
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('3A и B · Townвраги в одном месте');
    expect(screen.queryByRole('button', { name: 'Сделать нитью' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: /A и B · Town/ }));
    const facts = screen.getByRole('list', { name: 'Факты: A и B · Town' });
    expect(within(facts).getByText('Агент B в Town')).toBeInTheDocument();
    fireEvent.click(within(facts).getByRole('button', { name: 'B: база — Town' }));
    expect(onOpen).toHaveBeenCalledWith('organization:b');
  });

  it('«Сделать нитью» отдаёт напряжение; уже во входящих или нить — выключена и подписана', () => {
    const onThread = vi.fn();
    const { rerender } = render(<TensionList tensions={[T]} onOpen={() => {}} onThread={onThread} threadState={() => null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сделать нитью' }));
    expect(onThread).toHaveBeenCalledWith(T);
    rerender(<TensionList tensions={[T]} onOpen={() => {}} onThread={onThread} threadState={() => 'pending'} />);
    expect(screen.getByRole('button', { name: 'во входящих' })).toBeDisabled();
    rerender(<TensionList tensions={[T]} onOpen={() => {}} onThread={onThread} threadState={() => 'thread'} />);
    expect(screen.getByRole('button', { name: 'нить есть' })).toBeDisabled();
  });

  it('пусто — ничего', () => {
    const { container } = render(<TensionList tensions={[]} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
