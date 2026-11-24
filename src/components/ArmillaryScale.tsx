import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Popover } from 'radix-ui';
import type { ScaleLevel } from '../engine';
import { Icon } from '../icons/Icon';
import { ladderStepTitle, type ScaleStep } from './ScaleLadder';
import { SCALE_TEMPO_LABELS } from './scales';

export interface ArmillaryScaleProps {
  steps: readonly ScaleStep[];
  current: ScaleLevel;
  onSelect: (level: ScaleLevel) => void;
}

const CENTER = 118;
const DEGREES_PER_LEVEL = 55;
type RingDrag = { pointerId: number; lastAngle: number; remainder: number; selectedIndex: number };

/** Interactive scale rings. The ladder remains the compact keyboard path beside this instrument. */
export function ArmillaryScale({ steps, current, onSelect }: ArmillaryScaleProps) {
  const [open, setOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<RingDrag | null>(null);
  const suppressClickRef = useRef(false);
  const currentIndex = steps.findIndex(step => step.id === current);

  const choose = (level: ScaleLevel, close = true) => {
    onSelect(level);
    if (close) setOpen(false);
  };

  const onRingKeyDown = (event: KeyboardEvent<SVGGElement>, level: ScaleLevel) => {
    const index = steps.findIndex(step => step.id === level);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
      const next = steps[Math.max(0, Math.min(steps.length - 1, index + direction))];
      if (next) choose(next.id, false);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    choose(level);
  };

  const pointerAngle = (event: PointerEvent<SVGGElement>) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI;
  };

  const onRingPointerDown = (event: PointerEvent<SVGGElement>, level: ScaleLevel) => {
    if (level !== current || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, lastAngle: pointerAngle(event), remainder: 0, selectedIndex: currentIndex };
    suppressClickRef.current = false;
    setDragging(true);
  };

  const onRingPointerMove = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const angle = pointerAngle(event);
    let delta = angle - drag.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.lastAngle = angle;
    drag.remainder += delta;
    if (Math.abs(delta) > 0.5) {
      suppressClickRef.current = true;
      setRotation(value => (value + delta + 360) % 360);
    }
    const stepsToMove = Math.trunc(drag.remainder / DEGREES_PER_LEVEL);
    if (!stepsToMove) return;
    const nextIndex = Math.max(0, Math.min(steps.length - 1, drag.selectedIndex + stepsToMove));
    if (nextIndex !== drag.selectedIndex) {
      drag.selectedIndex = nextIndex;
      drag.remainder -= stepsToMove * DEGREES_PER_LEVEL;
      const next = steps[nextIndex];
      if (next) choose(next.id, false);
    } else {
      drag.remainder = 0;
    }
  };

  const onRingPointerEnd = (event: PointerEvent<SVGGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  const onRingPointerCancel = (event: PointerEvent<SVGGElement>) => {
    onRingPointerEnd(event);
    suppressClickRef.current = false;
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label="Армиллярная сфера масштабов" title="Выбрать масштаб кольцом" className="desk-armillary-trigger">
          <Icon name="scale-system" size={24} color="currentColor" title="Армиллярная сфера масштабов" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="left"
          align="center"
          sideOffset={8}
          collisionPadding={8}
          aria-label="Армиллярная сфера масштабов"
          className="desk-armillary-popover z-30 outline-none"
        >
          <div className="desk-armillary-head">
            <div>
              <h2 className="type-h-17 text-gd-hi">Сфера масштабов</h2>
              <p className="type-body-sm text-t2">Поверните выбранное кольцо; нажмите другое, чтобы выбрать уровень.</p>
            </div>
            <button type="button" aria-label="Закрыть сферу масштабов" onClick={() => setOpen(false)} className="desk-armillary-close">Закрыть</button>
          </div>
          <div className="desk-armillary-body">
            <svg className={`desk-armillary-orbits${dragging ? ' is-dragging' : ''}`} viewBox="0 0 236 236" role="group" aria-label="Кольца уровней карты">
              <defs>
                <radialGradient id="armillary-core" cx="35%" cy="30%">
                  <stop offset="0" stopColor="var(--gd-hi)" />
                  <stop offset=".45" stopColor="var(--br)" />
                  <stop offset="1" stopColor="var(--cd)" />
                </radialGradient>
              </defs>
              <circle cx={CENTER} cy={CENTER} r="104" fill="none" stroke="var(--lo)" strokeWidth="1" />
              <g transform={`rotate(${rotation} ${CENTER} ${CENTER})`}>
              <path d="M14 118H222M118 14V222" stroke="var(--gd)" strokeOpacity=".35" strokeWidth="2" />
              {steps.map((step, index) => {
                const rx = 38 + index * 7.8;
                const ry = 28 + index * 5.4;
                const angle = (index * 23 + currentIndex * 7) % 180;
                const selected = step.id === current;
                return (
                  <g
                    key={step.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${step.label}; темп: ${SCALE_TEMPO_LABELS[step.id]}`}
                    aria-current={selected ? 'step' : undefined}
                    onPointerDown={event => onRingPointerDown(event, step.id)}
                    onPointerMove={onRingPointerMove}
                    onPointerUp={onRingPointerEnd}
                    onPointerCancel={onRingPointerCancel}
                    onClick={() => {
                      if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                      choose(step.id);
                    }}
                    onKeyDown={event => onRingKeyDown(event, step.id)}
                    className={`desk-armillary-ring${selected ? ' is-current' : ''}`}
                  >
                    <ellipse
                      cx={CENTER}
                      cy={CENTER}
                      rx={rx}
                      ry={ry}
                      transform={`rotate(${angle} ${CENTER} ${CENTER})`}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="18"
                      className="desk-armillary-ring-hit"
                    />
                    <ellipse
                      cx={CENTER}
                      cy={CENTER}
                      rx={rx}
                      ry={ry}
                      transform={`rotate(${angle} ${CENTER} ${CENTER})`}
                      fill="none"
                      stroke={selected ? 'var(--gd-hi)' : 'var(--t2)'}
                      strokeOpacity={selected ? 1 : .74}
                      strokeWidth={selected ? 3.5 : 2}
                      pointerEvents="none"
                    />
                    <title>{ladderStepTitle(step, selected)}</title>
                  </g>
                );
              })}
              </g>
              <circle cx={CENTER} cy={CENTER} r="19" fill="url(#armillary-core)" stroke="var(--lo)" strokeWidth="3" pointerEvents="none" />
              <circle cx={CENTER} cy={CENTER} r="5" fill="var(--gd-hi)" pointerEvents="none" />
            </svg>
            <div className="desk-armillary-levels" role="group" aria-label="Уровни масштаба">
              {steps.map(step => (
                <button
                  key={step.id}
                  type="button"
                  data-scale={step.id}
                  aria-current={step.id === current ? 'step' : undefined}
                  title={ladderStepTitle(step, step.id === current)}
                  onClick={() => choose(step.id)}
                  className={step.id === current ? 'is-current' : undefined}
                >
                  <Icon name={`scale-${step.id}`} size={16} color="currentColor" title={step.label} />
                  <span>{step.label}</span>
                </button>
              ))}
            </div>
          </div>
          <Popover.Arrow className="desk-armillary-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default ArmillaryScale;
