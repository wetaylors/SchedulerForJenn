import { useState, useEffect } from 'react';
import type { AppSettings } from '../types';
import { getSettings, saveSettings, subscribeToStore } from '../store';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  useEffect(() => {
    return subscribeToStore(() => {
      setSettings(getSettings());
    });
  }, []);

  const updateSettings = (updated: AppSettings) => {
    setSettings(updated);
    saveSettings(updated);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Global configuration for the scheduler</p>
        </div>
      </div>

      <div className="content" style={{ maxWidth: 700 }}>
        {/* Schedule Pattern */}
        <div className="card">
          <div className="card-header">
            <h3>Schedule Pattern</h3>
          </div>
          <div className="card-body">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">2-Week Pattern Start Date</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: 220 }}
                  value={settings.patternStartDate}
                  onChange={e => updateSettings({ ...settings, patternStartDate: e.target.value })}
                />
                {settings.patternStartDate && (
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 13, padding: '4px 10px' }}
                    onClick={() => updateSettings({ ...settings, patternStartDate: '' })}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="form-hint">
                This date marks the beginning of "Week 1" for all providers. The 2-week cycle repeats from this date forward. Each provider's individual Week 1 / Week 2 schedule is configured on the Staff page.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, color: '#065f46', fontSize: 13 }}>Changes are saved automatically.</div>
      </div>
    </>
  );
}
