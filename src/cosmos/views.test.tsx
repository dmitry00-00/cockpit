import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlowGraph } from './FlowGraph';
import { Planetarium } from './Planetarium';
import { GreatWheel } from './GreatWheel';
import { WorldTree } from './WorldTree';

describe('Planetarium', () => {
  it('солнце, восемь планет, луны Toril; щелчок по телу — сведения с книгой; ползунок двигает тела', () => {
    render(<Planetarium day={0} />);
    const svg = screen.getByRole('img', { name: /^Планетарий Realmspace/ });
    for (const id of ['sun', 'anadia', 'toril', 'selune', 'tears', 'hcatha']) expect(svg.querySelector(`[data-body="${id}"]`), id).not.toBeNull();
    const info = () => document.querySelector('[data-part="body-info"]')!;
    expect(info()).toHaveTextContent('Toril');
    expect(info()).toHaveTextContent('200 млн миль от солнца');
    fireEvent.click(svg.querySelector('[data-body="karpri"]')!);
    expect(info()).toHaveTextContent('Karpri');
    expect(info()).toHaveTextContent('вода');
    expect(info()).toHaveTextContent('Realmspace, с. 32–35');
    const anadia = () => svg.querySelector('[data-body="anadia"] rect:last-of-type')!.getAttribute('x');
    const x0 = anadia();
    fireEvent.change(screen.getByRole('slider', { name: 'Дней вперёд от сегодняшнего' }), { target: { value: '10' } });
    expect(anadia()).not.toBe(x0);
    expect(document.querySelector('[data-part="approach-label"]')).toHaveTextContent(/^Ближе всех к Karpri: /);
  });

  it('«Спуститься» — только у тела, которое страница умеет открыть', () => {
    const onOpen = vi.fn();
    render(<Planetarium day={0} canOpen={b => b.id === 'toril'} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Спуститься: Toril' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'toril' }));
    fireEvent.click(screen.getByRole('img').querySelector('[data-body="glyth"]')!);
    expect(screen.queryByRole('button', { name: /^Спуститься/ })).toBeNull();
  });
});

describe('FlowGraph', () => {
  it('рёбра различаются рисунком: двустороннее толще, одностороннее со стрелкой, неизвестный обратный — штрих', () => {
    render(<FlowGraph />);
    const svg = screen.getByRole('img', { name: /^Флогистон/ });
    const line = (id: string) => svg.querySelector(`[data-flow="${id}"] line`)!;
    expect(line('realmspace-greyspace').getAttribute('stroke-width')).toBe('3');
    expect(line('realmspace-greyspace').getAttribute('marker-end')).toBeNull();
    expect(line('krynnspace-realmspace').getAttribute('marker-end')).toBe('url(#flow-arrow)');
    expect(line('krynnspace-realmspace').getAttribute('stroke-dasharray')).toBeNull();
    expect(line('realmspace-winterspace').getAttribute('stroke-dasharray')).toBe('6 4');
    expect(line('realmspace-clusterspace').getAttribute('stroke-dasharray')).toBe('1 4');
    expect(svg.querySelector('[data-flow="realmspace-shadowspace"]')).toHaveTextContent('12–21 день');
  });

  it('щелчок по сфере — её пути с книгами', () => {
    render(<FlowGraph />);
    fireEvent.click(screen.getByRole('img').querySelector('[data-sphere="pirtelspace"]')!);
    const info = document.querySelector('[data-part="sphere-info"]')!;
    expect(info).toHaveTextContent('Pirtelspace');
    expect(info.querySelector('[data-route="refuge"]')).toHaveTextContent('↔ Refuge · течение в обе стороны');
    expect(info.querySelector('[data-route="darnannon"]')).toHaveTextContent('Dungeon 36: The Sea of Sorrow, с. 44–45');
  });
});

describe('GreatWheel', () => {
  it('кольцо, Outlands, Материальный с внутренними планами; на старте — карточка плана партии', () => {
    render(<GreatWheel />);
    const svg = screen.getByRole('img', { name: /^Великое колесо/ });
    for (const id of ['celestia', 'abyss', 'outlands', 'sigil', 'astral', 'ethereal', 'material', 'fire', 'feywild']) {
      expect(svg.querySelector(`[data-plane="${id}"]`), id).not.toBeNull();
    }
    expect(svg.querySelectorAll('[data-gate]')).toHaveLength(16);
    expect(document.querySelector('[data-part="plane-info"]')).toHaveTextContent('Prime Material Plane');
  });

  it('щелчок по плану — свойства по-русски, дословное — в подсказке, слои и город-врата', () => {
    render(<GreatWheel />);
    fireEvent.click(screen.getByRole('button', { name: 'Nine Hells' }));
    const info = document.querySelector('[data-part="plane-info"]')!;
    expect(info).toHaveTextContent('законно-злой');
    expect(info).toHaveTextContent('девять бесконечных слоёв');
    expect(info.querySelector('[data-trait="shape"] dd')).toHaveAttribute('title', 'Вики: Nine infinite layers');
    expect(info).toHaveTextContent('Avernus, Dis, Minauros');
    expect(screen.getByRole('link', { name: 'Ribcage' })).toHaveAttribute('href', expect.stringMatching(/\/wiki\/Ribcage$/));
  });

  it('«Спуститься» — только у плана, который страница умеет открыть; клавиатура выбирает план', () => {
    const onOpen = vi.fn();
    render(<GreatWheel canOpen={p => p.id === 'material'} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Спуститься: Prime Material Plane' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'material' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Limbo' }), { key: 'Enter' });
    expect(document.querySelector('[data-part="plane-info"]')).toHaveTextContent('хаотично-нейтральный');
    expect(screen.queryByRole('button', { name: /^Спуститься/ })).toBeNull();
  });
});

describe('WorldTree', () => {
  it('Древо, река, группы, Материальный и корни; на старте — план партии', () => {
    render(<WorldTree />);
    const svg = screen.getByRole('img', { name: /^Великое древо/ });
    expect(svg.querySelector('[data-part="tree"]')).not.toBeNull();
    expect(svg.querySelectorAll('[data-river]')).toHaveLength(9);
    for (const id of ['gates-of-the-moon', 'heliopolis', 'fated-depths', 'cynosure', 'astral', 'fire', 'negative']) expect(svg.querySelector(`[data-plane="${id}"]`), id).not.toBeNull();
    expect(document.querySelector('[data-part="plane-info"]')).toHaveTextContent('Prime Material Plane');
    expect(svg.querySelectorAll('[data-portal]')).toHaveLength(0);
  });

  it('Abyss: исток реки, порталы на схеме и в карточке; Arvandor — корни Древа', () => {
    render(<WorldTree />);
    fireEvent.click(screen.getByRole('button', { name: 'Abyss' }));
    const info = () => document.querySelector('[data-part="plane-info"]')!;
    expect(info().querySelector('[data-part="tree-river"]')).toHaveTextContent('River of Blood: исток → в Blood Rift');
    expect(info().querySelector('[data-part="tree-portals"]')).toHaveTextContent('Deep Caverns (непостоянный)');
    expect(document.querySelectorAll('[data-portal]')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Arvandor' }));
    expect(info().querySelector('[data-part="tree-role"]')).toHaveTextContent('корни Древа');
    expect(info()).toHaveTextContent('слабо добрый и слабо хаотичный');
    fireEvent.click(screen.getByRole('button', { name: 'Heliopolis' }));
    expect(info().querySelector('[data-part="tree-role"]')).toHaveTextContent('ни Древа, ни River of Blood');
  });
});
