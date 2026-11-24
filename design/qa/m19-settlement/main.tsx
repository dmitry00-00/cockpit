import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettlementPlanView } from '../../../src/map/SettlementPlanView';
import { generateSettlementDraft } from '../../../src/map/settlementDraft';

const draft = generateSettlementDraft({ placeId: 'qa:neverwinter', seed: 'm19-two-exterior-doors' });
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main style={{ height: '100dvh', padding: 12, boxSizing: 'border-box' }}>
      <SettlementPlanView draft={draft} accepted={false} onAccept={() => {}} onClose={() => {}} />
    </main>
  </StrictMode>,
);
