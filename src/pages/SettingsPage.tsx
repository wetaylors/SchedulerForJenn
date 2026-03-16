import { useState, useEffect } from 'react';
import type { AppSettings } from '../types';
import { getSettings, saveSettings, getRuleToggles, saveRuleToggles, subscribeToStore } from '../store';

interface SchedulingRule {
  id: string;
  name: string;
  description: string;
  warning: string;
}

const SCHEDULING_RULES: SchedulingRule[] = [
  {
    id: 'tracy_consecutive',
    name: 'Tracy: Consecutive days at Main',
    description: 'Tracy must work in 2-day blocks at Main (Mon/Tue or Thu/Fri). If at Main, always in pairs — never 1 or 3 days.',
    warning: 'If disabled, Tracy may be scheduled for single days at Main, breaking her required pairing pattern.',
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const [ruleToggles, setRuleToggles] = useState<Record<string, boolean>>(() => getRuleToggles());

  useEffect(() => {
    return subscribeToStore(() => {
      setSettings(getSettings());
      setRuleToggles(getRuleToggles());
    });
  }, []);

  const updateSettings = (updated: AppSettings) => {
    setSettings(updated);
    saveSettings(updated);
  };

  const toggleRule = (id: string) => {
    const updated = { ...ruleToggles, [id]: !ruleToggles[id] };
    setRuleToggles(updated);
    saveRuleToggles(updated);
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

        {/* Scheduling Rules */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h3>Scheduling Rules</h3>
          </div>
          <div style={{ padding: 0 }}>
            {SCHEDULING_RULES.map(rule => (
              <div key={rule.id} className="rule-row">
                <div className="rule-info">
                  <div className="rule-name">{rule.name}</div>
                  <div className="rule-desc">{rule.description}</div>
                  {!ruleToggles[rule.id] && (
                    <div className="rule-warning">{rule.warning}</div>
                  )}
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={ruleToggles[rule.id] ?? true}
                    onChange={() => toggleRule(rule.id)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, color: '#065f46', fontSize: 13 }}>Changes are saved automatically.</div>
      </div>
    </>
  );
}
