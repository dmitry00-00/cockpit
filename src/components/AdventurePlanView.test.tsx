import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdventurePlanView } from './AdventurePlanView';
import { getRuntimePlanGeometry, PHANDELVER_RUNTIME_PLANS } from '../packages/phandelverRuntimePlans';
import type { AdventureBundle, AdventureNode } from '../packages/adventure';

const bundle = JSON.parse(readFileSync(`${process.cwd()}/research/content-phandelver/first-vertical.json`, 'utf8')) as AdventureBundle;

afterEach(cleanup);

describe('Phandelver runtime plan regions', () => {
  it('keeps the authored region view source-linked and navigable by keyboard', () => {
    const node = bundle.nodes.find((entry): entry is AdventureNode => entry.id === 'hideout-plan')!;
    const onOpenNode = vi.fn();
    render(<AdventurePlanView node={node} bundle={bundle} onOpenNode={onOpenNode} />);

    expect(screen.getByRole('link', { name: /Сверить ориентиры с источником/ })).toHaveAttribute('href', expect.stringContaining('5e.tools'));
    expect(screen.getByText(/Это естественная пещера.*Символов дверей на плане нет/)).toBeInTheDocument();
    const area = screen.getByRole('button', { name: 'Область 8 · Убежище Каменных Пастей' });
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(area).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть запись' }));
    expect(onOpenNode).toHaveBeenCalledWith('cragmaw-hideout');
  });

  it('validates every plan region against its package nodes and calibrated source scale', () => {
    for (const [nodeId, geometry] of Object.entries(PHANDELVER_RUNTIME_PLANS)) {
      const node = bundle.nodes.find(entry => entry.id === nodeId);
      expect(node, nodeId).toBeDefined();
      expect(getRuntimePlanGeometry(node!, bundle), nodeId).toBe(geometry);
      expect(geometry.sourceArtworkImported, nodeId).toBe(false);
      for (const area of geometry.areas) {
        if (area.targetNodeId) expect(bundle.nodes.some(entry => entry.id === area.targetNodeId), `${nodeId}/${area.id}`).toBe(true);
      }
    }
    expect(PHANDELVER_RUNTIME_PLANS['wave-echo-cave-plan'].areas.map(area => area.targetNodeId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `cave-room-${String(index + 1).padStart(2, '0')}`),
    );
  });
});
