import { useMemo, useState } from 'react';
import type { GeneratedWorldMaterialData } from '../import/generatedWorldMaterial';
import { dungeonTacticalPng, dungeonTacticalToUvtt, type DungeonTacticalGeometry } from './dungeonTactical';

const SIDE_LABEL: Record<string, string> = { north: 'северная', east: 'восточная', south: 'южная', west: 'западная' };
type DungeonWorldMaterial = GeneratedWorldMaterialData & {
  kind: 'dungeon';
  draft: Extract<GeneratedWorldMaterialData['draft'], { kind: 'dungeon' }>;
  tacticalGeometry: DungeonTacticalGeometry;
};

/** Review-only tactical proposal. Door edits apply to this export, never to campaign state. */
export function DungeonTacticalPreview({ data, materialId }: { data: GeneratedWorldMaterialData; materialId: string }) {
  if (data.kind !== 'dungeon' || data.draft.kind !== 'dungeon' || !data.tacticalGeometry) return null;
  return <DungeonTacticalPreviewContent data={data as DungeonWorldMaterial} materialId={materialId} />;
}

function DungeonTacticalPreviewContent({ data, materialId }: { data: DungeonWorldMaterial; materialId: string }) {
  const geometry = data.tacticalGeometry;
  const [doorStates, setDoorStates] = useState<Record<string, boolean>>({});
  const [exportError, setExportError] = useState<string | null>(null);
  const rendered = useMemo(() => {
    try { return { image: dungeonTacticalPng(geometry, doorStates), error: null }; }
    catch (error) { return { image: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [geometry, doorStates]);
  const roomNames = new Map(geometry.rooms.map(room => [room.id, room.name]));

  const exportUvtt = () => {
    setExportError(null);
    try {
      if (!rendered.image) throw new Error(rendered.error ?? 'Не удалось отрисовать изображение карты.');
      const uvtt = dungeonTacticalToUvtt(geometry, data.draft, rendered.image, {
        materialId,
        edition: data.edition,
        layer: data.layer,
        model: data.provenance.model,
        promptVersion: data.provenance.promptVersion,
        generatedAt: data.provenance.generatedAt,
      }, doorStates);
      const url = URL.createObjectURL(new Blob([JSON.stringify(uvtt)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${materialId.replace(/[^a-z0-9_-]+/gi, '-') || 'dungeon'}.dd2vtt`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section aria-label="Тактический план подземелья" className="my-2 flex flex-col gap-2 border border-bd bg-cd p-2">
      <div>
        <h3 className="type-body-sm text-tx">Тактическая схема · {geometry.layoutVersion}</h3>
        <p className="type-body-xs text-t2">
          Условная процедурная геометрия: клетка 5 футов, комнаты 20 × 20 футов, проходы шириной 5 футов.
          Позиции дверей выводятся из связей графа; двери изначально открыты. Это HB-предложение, не план из источника и не каноническая карта.
        </p>
      </div>
      {rendered.image ? (
        <img src={rendered.image} alt={`План подземелья ${data.draft.name}: стены, проходы и двери`} className="max-h-72 w-full border border-bd bg-wl object-contain" />
      ) : <p role="status" className="text-t2">Предпросмотр недоступен: {rendered.error}</p>}
      <p className="type-body-xs text-t2">
        {geometry.rooms.length} комнат · {geometry.corridors.length} проходов · {geometry.walls.length} сегментов стен · {geometry.doors.length} дверных порталов.
        {' '}Источник предложения: {data.provenance.model} / {data.provenance.promptVersion}.
      </p>
      <details>
        <summary className="cursor-pointer type-body-xs text-t2">Состояние дверей перед экспортом</summary>
        <ul className="mt-1 flex flex-col gap-1">
          {geometry.doors.map(door => {
            const isOpen = doorStates[door.id] ?? door.open;
            const roomName = door.roomId === 'outside' ? 'наружный вход' : roomNames.get(door.roomId) ?? door.roomId;
            return (
              <li key={door.id}>
                <button type="button" aria-pressed={isOpen} onClick={() => setDoorStates(current => ({ ...current, [door.id]: !isOpen }))} className="w-full bg-pl px-2 py-1 text-left type-body-xs text-tx shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]">
                  {roomName} · {SIDE_LABEL[door.side] ?? door.side} стена — {isOpen ? 'открыта' : 'закрыта'}
                </button>
              </li>
            );
          })}
        </ul>
      </details>
      <button type="button" disabled={!rendered.image} onClick={exportUvtt} className="bg-gd px-2 py-1 type-body-sm text-dk disabled:opacity-50">
        Скачать Universal VTT (.dd2vtt)
      </button>
      {exportError ? <p role="alert" className="type-body-xs text-t2">Экспорт не выполнен: {exportError}</p> : null}
      <p className="type-body-xs text-t2">В файл входят PNG-план, линии видимости, порталы и происхождение. Переключение дверей действует только на этот экспорт и не меняет состояние кампании.</p>
    </section>
  );
}
