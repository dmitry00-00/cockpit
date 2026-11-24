import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CharacterPathView } from './CharacterPathView';
import { classPath } from '../campaign/path';
import { CLASSES } from '../rules/compendium';
import { seedState } from '../campaign/seed';

describe('БА27: просмотр развития', () => {
  it('смена ветви и выбор будущего узла меняют только инспектор; текущий уровень остаётся на месте', () => {
    const cls=CLASSES[0], sub=cls.subclasses[1], path=classPath(cls,5,cls.subclasses[0].id);
    const snapshot=JSON.stringify(path);
    render(<CharacterPathView path={path}/>);
    const list=screen.getByRole('list',{name:`Путь: ${cls.nameRu}`});
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    fireEvent.change(screen.getByRole('combobox',{name:'Подкласс для просмотра'}),{target:{value:sub.id}});
    expect(screen.getByText(/Сравнение другой ветви/)).toBeInTheDocument();
    const f=sub.features[0];
    const row=list.querySelector(`[data-level="${f.level}"]`)! as HTMLElement;
    fireEvent.click(within(row).getByRole('button',{name:new RegExp(f.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}));
    const inspector=()=>screen.getByRole('region',{name:'Описание развития'});
    expect(within(inspector()).getByRole('heading',{name:f.name})).toBeInTheDocument();
    expect(inspector()).toHaveTextContent('Другая ветвь');
    fireEvent.click(screen.getByRole('button',{name:'Уровень 20: сводка'}));
    expect(inspector()).toHaveTextContent('Сводка 20-го уровня');
    expect(list.querySelector('[aria-current="step"]')).toHaveAttribute('data-level','5');
    expect(JSON.stringify(path)).toBe(snapshot);
    fireEvent.click(screen.getByRole('button',{name:'К текущему персонажу'}));
    expect(screen.getByRole('combobox')).toHaveValue(path.subclassId);
    expect(inspector()).toHaveTextContent('Сводка 5-го уровня');
  });
  it('не объединяет альтернативы и не скрывает отсутствующий текст', () => {
    const path=classPath(CLASSES[0],1);
    const f={id:'review',name:'Вариант А / Вариант Б',text:''};
    render(<CharacterPathView path={{...path,steps:path.steps.map(s=>s.level===1?{...s,features:[f]}:s)}}/>);
    fireEvent.click(screen.getByRole('button',{name:/Вариант А \/ Вариант Б/}));
    const inspector=()=>screen.getByRole('region',{name:'Описание развития'});
    expect(inspector()).toHaveTextContent('объединены альтернативы');
    expect(inspector()).toHaveTextContent('отсутствует в исходной таблице');
  });

  it('дерево остаётся основной поверхностью, план закрыт по умолчанию и сохраняет решения при сворачивании', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, subclassId: 'voin-cempion' } };
    const cls = CLASSES.find(c => c.id === 'voin')!;
    render(<CharacterPathView path={classPath(cls, actor.sheet!.level, actor.sheet!.subclassId)} actor={actor} />);
    expect(screen.getByRole('list', { name: `Путь: ${cls.nameRu}` })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'План повышений' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Планировать развитие' }));
    expect(screen.getByText(/план строится по текущему листу и выбранному в нём подклассу/i)).toBeInTheDocument();
    expect(screen.getByText(/выбор ветви выше служит для сравнения и не меняет этот план/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Характеристика' }), { target: { value: 'con' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    const filled = screen.getByRole('list', { name: 'Заполненные шаги плана' });
    expect(filled).toHaveTextContent('+2 CON');
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть план развития' }));
    expect(screen.queryByRole('region', { name: 'План повышений' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Планировать развитие' }));
    expect(screen.getByRole('list', { name: 'Заполненные шаги плана' })).toHaveTextContent('+2 CON');
    expect(screen.getByRole('list', { name: `Путь: ${cls.nameRu}` })).toBeInTheDocument();
  });
});
