import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StaffMember, Facility, TimeOffRequest, AppSettings } from '../types';
import { getStaff, getFacilities, getTimeOff, getSettings, subscribeToStore } from '../store';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Format schedule for display
function formatSchedule(s: StaffMember['schedule']): { label: string; isFt: boolean } {
  if (s.mode === 'specific') {
    const w1 = s.week1Days?.length === 5;
    const w2 = s.week2Days?.length === 5;
    if (w1 && w2) return { label: 'M-F / M-F', isFt: true };
    const fmt = (days: string[] | undefined) => days?.join('') || '\u2014';
    return { label: `${fmt(s.week1Days)} / ${fmt(s.week2Days)}`, isFt: false };
  }
  const c1 = s.week1Count ?? 0;
  const c2 = s.week2Count ?? 0;
  if (c1 === 5 && c2 === 5) return { label: 'M-F / M-F', isFt: true };
  return { label: `${c1}d / ${c2}d`, isFt: false };
}

// Format preference for display
function formatPref(p: StaffMember['preferences'][0]): string {
  const cat = p.category === 'Facility' ? 'Fac' : 'Day';
  const days = p.days && p.days.length > 0 ? ` ${p.days.join('/')}` : '';
  const pri = p.priority ? ` (P${p.priority})` : '';
  return `${cat}: ${p.type} ${p.value}${days}${pri}`;
}

// Format capability requirements
function formatCapabilities(caps: Facility['requiredCapabilities']): string[] {
  if (caps.length === 0) return [];
  return caps.map(cap => {
    const allWeekdays = WEEKDAYS.every(d => cap.days.includes(d));
    const dayStr = allWeekdays ? 'M-F' : cap.days.join(', ');
    return `${cap.capability} (${dayStr})`;
  });
}

// Format weekday provider range
function formatProviders(min: number, max: number): string {
  if (min === max) return `${min} provider${min !== 1 ? 's' : ''}`;
  return `${min}-${max} providers`;
}

// Format date
function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Count days between two dates inclusive
function dayCount(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export default function DashboardPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ patternStartDate: '' });
  const navigate = useNavigate();

  useEffect(() => {
    const load = () => {
      setStaff(getStaff());
      setFacilities(getFacilities());
      setTimeOff(getTimeOff());
      setSettings(getSettings());
    };
    load();
    return subscribeToStore(load);
  }, []);

  // Build facility name map
  const facNameMap = Object.fromEntries(facilities.map(f => [f.id, f.name]));

  // Build staff name map
  const staffNameMap = Object.fromEntries(staff.map(s => [s.id, s.name]));

  const hasData = staff.length > 0 || facilities.length > 0;

  // Format pattern start date for rules display
  const patternDateLabel = settings.patternStartDate
    ? new Date(settings.patternStartDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'not set';


  return (
    <>
      <div className="page-header">
        <div>
          <h2>Scheduler Dashboard</h2>
          <p>Review all inputs, then go to the Schedule page to generate</p>
        </div>
      </div>

      {!hasData ? (
        <div className="content">
          <div className="card">
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              <strong style={{ fontSize: 16, color: '#666', display: 'block', marginBottom: 6 }}>Get started</strong>
              Add your staff and facilities to begin building schedules.
            </div>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          {/* STAFF SUMMARY */}
          <div className="card">
            <div className="card-header">
              <h3>Staff</h3>
              <span className="dash-count">{staff.length} provider{staff.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Facilities</th>
                    <th>Capabilities</th>
                    <th>Schedule</th>
                    <th>Preferences</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => {
                    const sched = formatSchedule(s.schedule);
                    return (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td><span className={`badge badge-${s.type.toLowerCase()}`}>{s.type}</span></td>
                        <td>
                          {s.facilities.map(fid => (
                            <span key={fid} className="badge badge-facility">{facNameMap[fid] ?? fid}</span>
                          ))}
                        </td>
                        <td>
                          {s.capabilities.length > 0
                            ? s.capabilities.map(c => <span key={c} className="badge badge-cap">{c}</span>)
                            : <span>&mdash;</span>
                          }
                        </td>
                        <td>
                          <span className={`badge ${sched.isFt ? 'badge-ft' : 'badge-pt'}`}>{sched.label}</span>
                          {s.schedule.saturdayAvailable && <> <span className="badge badge-sat">Sat</span></>}
                        </td>
                        <td>
                          {s.preferences.length > 0
                            ? s.preferences.map(p => <span key={p.id} className="badge badge-pref">{formatPref(p)}</span>)
                            : <span>&mdash;</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* FACILITY SUMMARY */}
          <div className="card">
            <div className="card-header">
              <h3>Facilities</h3>
              <span className="dash-count">{facilities.length} facilit{facilities.length !== 1 ? 'ies' : 'y'}</span>
            </div>
            <div style={{ overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Weekday Need</th>
                    <th>Saturday</th>
                    <th>Sunday</th>
                    <th>Required Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {facilities.map(f => {
                    const caps = formatCapabilities(f.requiredCapabilities);
                    return (
                      <tr key={f.id}>
                        <td><strong>{f.name}</strong></td>
                        <td>
                          <div className="req-bar">
                            <div className="req-bar-fill" style={{ width: Math.max(15, f.weekdayMax * 20) }}></div>
                            <span>{formatProviders(f.weekdayMin, f.weekdayMax)}</span>
                          </div>
                        </td>
                        <td>
                          {f.saturdayOpen
                            ? <span className="badge badge-open">{f.saturdayCount} provider{f.saturdayCount !== 1 ? 's' : ''}</span>
                            : <span className="badge badge-closed">Closed</span>
                          }
                        </td>
                        <td>
                          {f.sundayOpen
                            ? <span className="badge badge-open">{f.sundayCount} provider{f.sundayCount !== 1 ? 's' : ''}</span>
                            : <span className="badge badge-closed">Closed</span>
                          }
                        </td>
                        <td>
                          {caps.length > 0
                            ? caps.map(c => <span key={c} className="badge badge-cap">{c}</span>)
                            : <span>&mdash;</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* TIME OFF */}
          <div className="card">
            <div className="card-header">
              <h3>Time Off</h3>
              <span className="dash-count">{timeOff.length} request{timeOff.length !== 1 ? 's' : ''}</span>
            </div>
            <div>
              {timeOff.length === 0 ? (
                <div style={{ padding: 18, color: '#999', fontSize: 13 }}>No time off requests.</div>
              ) : (
                timeOff.map(r => (
                  <div key={r.id} className="timeoff-item">
                    <div>
                      <div className="timeoff-name">{staffNameMap[r.staffId] ?? r.staffId}</div>
                      <div className="timeoff-dates">
                        {formatDate(r.startDate)}
                        {r.startDate !== r.endDate && <> - {formatDate(r.endDate)}</>}
                        {' '}({dayCount(r.startDate, r.endDate)} day{dayCount(r.startDate, r.endDate) !== 1 ? 's' : ''})
                        {r.notes && <> &mdash; {r.notes}</>}
                      </div>
                    </div>
                    <span className="badge badge-pto">PTO</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SCHEDULING RULES */}
          <div className="card">
            <div className="card-header">
              <h3>Scheduling Rules</h3>
              <span className="dash-count">Active</span>
            </div>
            <div>
              <div className="rule-item"><div className="rule-icon">C</div><div className="rule-text"><strong>Coverage:</strong> All facility minimums must be met each day</div></div>
              <div className="rule-item"><div className="rule-icon">P</div><div className="rule-text"><strong>Capabilities:</strong> Facilities with required capabilities must have a qualified provider on required days</div></div>
              <div className="rule-item"><div className="rule-icon">R</div><div className="rule-text"><strong>Restrictions:</strong> Providers only assigned to their allowed facilities</div></div>
              <div className="rule-item"><div className="rule-icon">T</div><div className="rule-text"><strong>Time Off:</strong> Honor all approved time-off requests</div></div>
              <div className="rule-item"><div className="rule-icon">W</div><div className="rule-text"><strong>Work Schedule:</strong> Providers scheduled per their pattern (start: {patternDateLabel})</div></div>
              <div className="rule-item"><div className="rule-icon">F</div><div className="rule-text"><strong>Fairness:</strong> Balance Saturday shifts evenly across available providers</div></div>
              <div className="rule-item"><div className="rule-icon">S</div><div className="rule-text"><strong>Preferences:</strong> Honor provider preferences by priority (1=highest). Violations flagged on calendar</div></div>
              <div className="rule-item"><div className="rule-icon">T</div><div className="rule-text"><strong>Tracy:</strong> East Clinic on Wed; exactly Mon+Tue or Thu+Fri at Main</div></div>
            </div>
          </div>

          {/* GO TO SCHEDULE */}
          <div className="generate-section">
            <button className="btn-generate-dash" onClick={() => navigate('/schedule')}>
              Go to Schedule &rarr;
            </button>
          </div>
        </div>
      )}
    </>
  );
}
