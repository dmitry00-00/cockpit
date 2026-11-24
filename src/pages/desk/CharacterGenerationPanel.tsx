import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { PcSpec } from '../../campaign/derive';
import type { Era } from '../../campaign/era';
import { classById, raceById, type Source } from '../../rules/compendium';
import { PARTY } from '../../campaign/party';
import { CharacterEditor } from '../editor/CharacterEditor';
import { BTN } from './styles';

interface Props {
  busy: boolean;
  onGenerate: (template: PcSpec, concept: string) => Promise<void>;
  onGenerateBuild: (spec: PcSpec, concept: string) => Promise<void>;
  takenIds: ReadonlySet<string>;
  overlayContainer: HTMLElement | null;
  era: Era;
}

const INPUT = 'min-w-0 bg-wl px-2 py-1 type-body-sm text-tx shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const TEMPLATES = PARTY.filter(spec => classById(spec.classId)?.source === 'srd' && raceById(spec.raceId)?.source === 'srd');
const SRD_ONLY: readonly Source[] = ['srd'];

/** Narrative stays model-generated; arbitrary builds use the validated character editor and the same derived sheet. */
export function CharacterGenerationPanel({ busy, onGenerate, onGenerateBuild, takenIds, overlayContainer, era }: Props) {
  const [templateId, setTemplateId] = useState(TEMPLATES[0]?.id ?? '');
  const [concept, setConcept] = useState('');
  const [error, setError] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const template = TEMPLATES.find(item => item.id === templateId) ?? TEMPLATES[0];

  useEffect(() => {
    if (!TEMPLATES.some(item => item.id === templateId) && TEMPLATES[0]) setTemplateId(TEMPLATES[0].id);
  }, [templateId]);

  const submit = async () => {
    if (!template || !concept.trim() || busy) return;
    setError('');
    try { await onGenerate(template, concept.trim()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <details className="mt-2 bg-cd p-2 shadow-bevel">
      <summary className="cursor-pointer type-body-sm text-tx">Создать персонажа по SRD-шаблону</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="type-body-xs text-t2">Локальная модель создаёт имя и биографию. Механика останется точной копией выбранного SRD-шаблона и будет пересчитана движком.</p>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Механический шаблон
          <select aria-label="SRD-шаблон персонажа" className={INPUT} value={template?.id ?? ''} onChange={event => setTemplateId(event.target.value)} disabled={busy || !TEMPLATES.length}>
            {TEMPLATES.map(item => {
              const race = raceById(item.raceId), cls = classById(item.classId);
              return <option key={item.id} value={item.id}>{race?.nameRu ?? item.raceId} · {cls?.nameRu ?? item.classId} · {item.level} ур.</option>;
            })}
          </select>
        </label>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Концепт
          <textarea aria-label="Концепт персонажа" className={`${INPUT} min-h-16 resize-y`} maxLength={500} value={concept} onChange={event => setConcept(event.target.value)} placeholder="Например: бывший храмовый страж, ищущий пропавшую сестру" />
        </label>
        <button type="button" className={BTN} disabled={busy || !template || !concept.trim()} onClick={() => void submit()}>
          {busy ? 'Локальная модель пишет…' : 'Создать предложение'}
        </button>
        <button type="button" className={BTN} disabled={busy || !concept.trim()} onClick={() => { setError(''); setBuilderOpen(true); }}>
          Собрать произвольного персонажа
        </button>
        <p className="type-body-xs text-t2">В редакторе можно выбрать расу, класс, уровень, характеристики, навыки, умения, заклинания и снаряжение. SRD ограничивает механические источники; справочник божеств и персональный текст атрибутируются отдельно. Биографию предложит локальная модель.</p>
        {error ? <p role="alert" className="type-body-xs text-fx-damage-hi">{error}</p> : null}
      </div>
      <Dialog.Root open={builderOpen} modal={false} onOpenChange={open => { if (!open && !busy) setBuilderOpen(false); }}>
        <Dialog.Portal container={overlayContainer ?? undefined}>
          <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
          <Dialog.Content aria-describedby={undefined} className="absolute inset-4 z-30 flex justify-center outline-none focus-visible:shadow-none">
            <Dialog.Title className="sr-only">Произвольная сборка персонажа</Dialog.Title>
            <CharacterEditor
              takenIds={takenIds}
              fixedSources={SRD_ONLY}
              era={era}
              onCreate={spec => onGenerateBuild(spec, concept.trim())}
              onClose={() => { if (!busy) setBuilderOpen(false); }}
              createLabel="Создать предложение"
              createTitle="Пересчитать собранный лист и предложить персонажа; в кампанию он попадёт только после отдельного подтверждения"
              closeOnCreate
              createBusy={busy}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </details>
  );
}
