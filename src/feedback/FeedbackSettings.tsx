import { useEffect, useState } from 'react';
import {
  emitFeedback,
  getFeedbackPreferences,
  saveFeedbackPreferences,
  supportsAudioFeedback,
  supportsVibrationFeedback,
  type FeedbackScope,
  type FeedbackPreferences,
} from './feedback';
import './feedback.css';

interface FeedbackSettingsProps {
  variant?: 'compact' | 'player';
  scope: FeedbackScope;
}

export function FeedbackSettings({ variant = 'compact', scope }: FeedbackSettingsProps) {
  const [preferences, setPreferences] = useState<FeedbackPreferences>(() => getFeedbackPreferences(scope));
  const [testStatus, setTestStatus] = useState('');
  const audioAvailable = supportsAudioFeedback();
  const vibrationAvailable = supportsVibrationFeedback();

  useEffect(() => {
    const sync = () => setPreferences(getFeedbackPreferences(scope));
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [scope]);

  function update(changes: Partial<FeedbackPreferences>) {
    const next = { ...preferences, ...changes };
    setPreferences(next);
    saveFeedbackPreferences(scope, next);
    setTestStatus('');
  }

  function testSound() {
    emitFeedback('confirm', scope, { sound: true, vibration: false });
    setTestStatus(audioAvailable
      ? 'Запрошен короткий сигнал. Его громкость зависит от устройства.'
      : 'В этом браузере звуковой сигнал недоступен.');
  }

  function testVibration() {
    const result = emitFeedback('confirm', scope, { sound: false, vibration: true });
    setTestStatus(result.vibrationAccepted
      ? 'Команда вибрации отправлена; отклик зависит от устройства.'
      : 'Браузер не принял команду вибрации.');
  }

  const enabledLabel = preferences.sound && preferences.vibration ? 'звук · вибрация'
    : preferences.sound ? 'звук' : preferences.vibration ? 'вибрация' : 'выкл.';

  return <details className={`feedback-settings feedback-settings--${variant}`} data-feedback-skip>
    <summary><span>Отклик</span><span className="feedback-settings__summary-state">{enabledLabel}</span></summary>
    <div className="feedback-settings__panel">
      <p>Короткие сигналы на действия. Согласие хранится локально и не передаётся мастеру.</p>
      <label>
        <input type="checkbox" checked={preferences.sound} onChange={event => update({ sound: event.target.checked })} />
        <span>Звук интерфейса{audioAvailable ? '' : ' · недоступен'}</span>
      </label>
      <label>
        <input type="checkbox" checked={preferences.vibration} onChange={event => update({ vibration: event.target.checked })} />
        <span>Вибрация{vibrationAvailable ? '' : ' · недоступна в этом браузере'}</span>
      </label>
      <div className="feedback-settings__tests">
        <button type="button" disabled={!audioAvailable} onClick={testSound}>Проверить звук</button>
        <button type="button" disabled={!vibrationAvailable} onClick={testVibration}>Проверить вибрацию</button>
      </div>
      {testStatus ? <p className="feedback-settings__status" role="status" aria-live="polite">{testStatus}</p> : null}
    </div>
  </details>;
}
