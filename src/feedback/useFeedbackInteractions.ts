import { useEffect } from 'react';
import { emitControlFeedback, type FeedbackScope } from './feedback';

/** Capture at document level so controls in modal portals receive the same opt-in feedback. */
export function useFeedbackInteractions(scope: FeedbackScope): void {
  useEffect(() => {
    const onClick = (event: MouseEvent) => emitControlFeedback(event, scope);
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [scope]);
}
