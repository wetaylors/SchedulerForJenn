import { useState, useEffect } from 'react';
import type { StaffMember, Preference, SchedulePattern } from '../types';
import { getStaff, saveStaff, getFacilities, getAllCapabilities, hasSeeded, markSeeded, saveFacilities, subscribeToStore } from '../store';
import { seedStaff, seedFacilities } from '../data/seed';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
// Map short day names to full names
const SHORT_TO_FULL: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };

const PRIORITY_OPTIONS = [
  { value: '', label: '--' },
  { value: '1', label: '1 - Highest' },
  { value: '2', label: '2 - High' },
  { value: '3', label: '3 - Medium' },
  { value: '4', label: '4 - Low' },
  { value: '5', label: '5 - Lowest' },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emptySchedule(): SchedulePattern {
  return {
    mode: 'daysPerWeek',
    week1Days: [],
    week2Days: [],
    week1Count: 0,
    week2Count: 0,
    excludedDays: [],
    saturdayAvailable: false,
  };
}

function emptyStaff(): StaffMember {
  return {
    id: generateId(),
    name: '',
    type: 'PA',
    facilities: [],
    capabilities: [],
    schedule: emptySchedule(),
    preferences: [],
    notes: '',
  };
}

function emptyPreference(): Preference {
  return { id: generateId(), category: 'Facility', type: 'Prefer', value: '', days: [] };
}

// Format schedule for display in table
function formatSchedule(s: SchedulePattern): { label: string; isFt: boolean } {
  if (s.mode === 'specific') {
    const w1 = s.week1Days?.length === 5;
    const w2 = s.week2Days?.length === 5;
    if (w1 && w2) return { label: 'M-F / M-F', isFt: true };
    const fmt = (days: string[] | undefined) => days?.join('') || '—';
    return { label: `${fmt(s.week1Days)} / ${fmt(s.week2Days)}`, isFt: false };
  }
  const c1 = s.week1Count ?? 0;
  const c2 = s.week2Count ?? 0;
  if (c1 === 5 && c2 === 5) return { label: 'M-F / M-F', isFt: true };
  return { label: `${c1}d / ${c2}d`, isFt: false };
}

// Format preference for display in table
function formatPref(p: Preference): string {
  const cat = p.category === 'Facility' ? 'Fac' : 'Day';
  const days = p.days && p.days.length > 0 ? ` ${p.days.join('/')}` : '';
  const pri = p.priority ? ` (P${p.priority})` : '';
  return `${cat}: ${p.type} ${p.value}${days}${pri}`;
}

// Modal form for add/edit
function StaffModal({
  staff,
  title,
  facilities,
  capabilities,
  onSave,
  onClose,
}: {
  staff: StaffMember;
  title: string;
  facilities: { id: string; name: string }[];
  capabilities: string[];
  onSave: (s: StaffMember) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<StaffMember>({
    ...staff,
    schedule: { ...staff.schedule },
    preferences: staff.preferences.map(p => ({ ...p, days: p.days ? [...p.days] : [] })),
  });

  const updateField = <K extends keyof StaffMember>(key: K, val: StaffMember[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const updateSchedule = <K extends keyof SchedulePattern>(key: K, val: SchedulePattern[K]) =>
    setForm(prev => ({ ...prev, schedule: { ...prev.schedule, [key]: val } }));

  const toggleInArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const updatePref = (index: number, updates: Partial<Preference>) => {
    const prefs = form.preferences.map((p, i) => i === index ? { ...p, ...updates } : p);
    updateField('preferences', prefs);
  };

  const togglePrefDay = (index: number, day: string) => {
    const pref = form.preferences[index];
    const currentDays = pref.days ?? [];
    const newDays = currentDays.includes(day) ? currentDays.filter(d => d !== day) : [...currentDays, day];
    updatePref(index, { days: newDays });
  };

  const addPref = () => updateField('preferences', [...form.preferences, emptyPreference()]);

  const removePref = (index: number) => {
    const prefs = [...form.preferences];
    prefs.splice(index, 1);
    updateField('preferences', prefs);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave(form);
  };

  // All days and facilities available for preferences (no filtering)
  const workableDays = WEEKDAYS;
  const providerFacilities = facilities;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {/* Name */}
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Provider name" />
          </div>

          {/* Type */}
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.type} onChange={e => updateField('type', e.target.value as 'PA' | 'NP')}>
              <option value="PA">PA</option>
              <option value="NP">NP</option>
            </select>
          </div>

          {/* Facilities */}
          <div className="form-group">
            <label className="form-label">Facilities</label>
            <div className="checkbox-group">
              {facilities.map(f => (
                <label key={f.id} className="checkbox-label">
                  <input type="checkbox" checked={form.facilities.includes(f.id)} onChange={() => updateField('facilities', toggleInArray(form.facilities, f.id))} />
                  {f.name}
                </label>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          <div className="form-group">
            <label className="form-label">Capabilities</label>
            <div className="checkbox-group">
              {capabilities.map(cap => (
                <label key={cap} className="checkbox-label">
                  <input type="checkbox" checked={form.capabilities.includes(cap)} onChange={() => updateField('capabilities', toggleInArray(form.capabilities, cap))} />
                  {cap}
                </label>
              ))}
            </div>
            <div className="form-hint">Capabilities are managed on the Facilities page.</div>
          </div>

          {/* Schedule */}
          <div className="form-group">
            <label className="form-label">
              Schedule Pattern <span className="form-label-sub">(repeats every 2 weeks)</span>
            </label>
            <div className="schedule-box">
              {/* Mode toggle */}
              <div className="schedule-mode-bar">
                <span>Mode:</span>
                <label>
                  <input type="radio" checked={form.schedule.mode === 'specific'} onChange={() => updateSchedule('mode', 'specific')} />
                  Specific days
                </label>
                <label>
                  <input type="radio" checked={form.schedule.mode === 'daysPerWeek'} onChange={() => updateSchedule('mode', 'daysPerWeek')} />
                  Days per week
                </label>
              </div>

              {form.schedule.mode === 'specific' ? (
                <>
                  <div className="schedule-section">
                    <div className="schedule-section-title">Week 1</div>
                    <div className="schedule-days">
                      {WEEKDAYS.map(d => (
                        <label key={d}>
                          <input type="checkbox" checked={form.schedule.week1Days?.includes(d) ?? false} onChange={() => updateSchedule('week1Days', toggleInArray(form.schedule.week1Days ?? [], d))} />
                          {d}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="schedule-section">
                    <div className="schedule-section-title">Week 2</div>
                    <div className="schedule-days">
                      {WEEKDAYS.map(d => (
                        <label key={d}>
                          <input type="checkbox" checked={form.schedule.week2Days?.includes(d) ?? false} onChange={() => updateSchedule('week2Days', toggleInArray(form.schedule.week2Days ?? [], d))} />
                          {d}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="schedule-row">
                    <span className="schedule-row-label">Week 1</span>
                    <input type="number" className="count-input" min={0} max={5} value={form.schedule.week1Count ?? 0} onChange={e => updateSchedule('week1Count', Number(e.target.value))} />
                    <span style={{ fontSize: 13, color: '#666' }}>days</span>
                  </div>
                  <div className="schedule-row">
                    <span className="schedule-row-label">Week 2</span>
                    <input type="number" className="count-input" min={0} max={5} value={form.schedule.week2Count ?? 0} onChange={e => updateSchedule('week2Count', Number(e.target.value))} />
                    <span style={{ fontSize: 13, color: '#666' }}>days</span>
                  </div>
                  <div className="schedule-hint">Scheduler will choose the best days based on coverage needs</div>

                  {/* Excluded days — only in Days per week mode */}
                  <div className="schedule-section">
                    <div className="schedule-section-title">
                      Excluded Days <span className="schedule-section-sub">(never schedule on these days)</span>
                    </div>
                    <div className="schedule-days">
                      {WEEKDAYS.map(d => (
                        <label key={d}>
                          <input type="checkbox" checked={form.schedule.excludedDays.includes(d)} onChange={() => updateSchedule('excludedDays', toggleInArray(form.schedule.excludedDays, d))} />
                          {d}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Saturday */}
              <div className="schedule-saturday">
                <label>
                  <input type="checkbox" checked={form.schedule.saturdayAvailable} onChange={e => updateSchedule('saturdayAvailable', e.target.checked)} />
                  Available for Saturday shifts
                </label>
                <div className="form-hint">Saturday shifts are rotated evenly among available providers</div>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="form-group">
            <label className="form-label">Preferences</label>
            <div className="pref-box">
              <div className="pref-header">
                <span style={{ flex: 0.8 }}>Category</span>
                <span style={{ flex: 0.6 }}>Type</span>
                <span style={{ flex: 1.7 }}>Value</span>
                <span style={{ flex: 0.9 }}>Priority</span>
                <span style={{ width: 26 }}></span>
              </div>
              {form.preferences.map((pref, i) => (
                <div key={pref.id} className="pref-row" style={{ flexWrap: 'wrap' }}>
                  <select style={{ flex: 0.8 }} value={pref.category} onChange={e => {
                    updatePref(i, { category: e.target.value as 'Day' | 'Facility', value: '', days: [] });
                  }}>
                    <option value="Day">Day</option>
                    <option value="Facility">Facility</option>
                  </select>
                  <select style={{ flex: 0.6 }} value={pref.type} onChange={e => updatePref(i, { type: e.target.value as 'Prefer' | 'Avoid' })}>
                    <option value="Prefer">Prefer</option>
                    <option value="Avoid">Avoid</option>
                  </select>
                  {pref.category === 'Facility' ? (
                    <select style={{ flex: 1.7 }} value={pref.value} onChange={e => updatePref(i, { value: e.target.value })}>
                      <option value="">--</option>
                      {providerFacilities.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                    </select>
                  ) : (
                    <select style={{ flex: 1.7 }} value={pref.value} onChange={e => updatePref(i, { value: e.target.value })}>
                      <option value="">--</option>
                      {workableDays.map(d => <option key={d} value={SHORT_TO_FULL[d]}>{SHORT_TO_FULL[d]}</option>)}
                    </select>
                  )}
                  <select style={{ flex: 0.9 }} value={pref.priority?.toString() ?? ''} onChange={e => updatePref(i, { priority: e.target.value ? Number(e.target.value) as 1|2|3|4|5 : undefined })}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button className="pref-remove" onClick={() => removePref(i)} title="Remove">&times;</button>
                  {/* Day checkboxes for Facility preferences */}
                  {pref.category === 'Facility' && (
                    <div style={{ width: '100%', paddingTop: 6, paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Days:</span>
                      {workableDays.map(d => (
                        <label key={d} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="checkbox" checked={pref.days?.includes(d) ?? false} onChange={() => togglePrefDay(i, d)} />
                          {d}
                        </label>
                      ))}
                      {workableDays.length === 0 && <span style={{ fontSize: 11, color: '#999' }}>Set schedule first</span>}
                    </div>
                  )}
                </div>
              ))}
              <div className="pref-add-row">
                <button className="btn-add-pref" onClick={addPref}>+ Add Preference</button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Notes <span className="form-label-sub">(optional)</span></label>
            <textarea className="form-textarea" value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Any special rules or reminders about this provider..." />
          </div>

          {/* Buttons */}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [facilityList, setFacilityList] = useState<{ id: string; name: string }[]>([]);
  const [capabilityList, setCapabilityList] = useState<string[]>([]);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSeeded()) {
      saveStaff(seedStaff);
      saveFacilities(seedFacilities);
      markSeeded();
    }
    const load = () => {
      setStaff(getStaff());
      const facilities = getFacilities();
      setFacilityList(facilities.map(f => ({ id: f.id, name: f.name })));
      setCapabilityList(getAllCapabilities());
    };
    load();
    return subscribeToStore(load);
  }, []);

  const refreshStaff = () => {
    const updated = getStaff();
    setStaff(updated);
  };

  const refreshListsFromStore = () => {
    const facilities = getFacilities();
    setFacilityList(facilities.map(f => ({ id: f.id, name: f.name })));
    setCapabilityList(getAllCapabilities());
  };

  const handleAdd = () => {
    refreshListsFromStore();
    setEditingStaff(emptyStaff());
    setModalMode('add');
  };

  const handleEdit = (s: StaffMember) => {
    refreshListsFromStore();
    setEditingStaff(s);
    setModalMode('edit');
  };

  const handleSave = (s: StaffMember) => {
    const all = getStaff();
    if (modalMode === 'add') {
      all.push(s);
    } else {
      const idx = all.findIndex(x => x.id === s.id);
      if (idx >= 0) all[idx] = s;
    }
    saveStaff(all);
    refreshStaff();
    setModalMode(null);
    setEditingStaff(null);
  };

  const handleDelete = (id: string) => {
    const all = getStaff().filter(s => s.id !== id);
    saveStaff(all);
    refreshStaff();
    setDeleteConfirm(null);
  };

  // Map facility IDs to names for display
  const facilityNameMap = Object.fromEntries(facilityList.map(f => [f.id, f.name]));

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Staff</h2>
          <p>Manage providers, their availability, and preferences</p>
        </div>
        <button className="btn-primary" onClick={handleAdd}>+ Add Provider</button>
      </div>

      <div className="content">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Facilities</th>
                <th>Capabilities</th>
                <th>Schedule</th>
                <th>Preferences</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => {
                const sched = formatSchedule(s.schedule);
                return (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td>
                      <span className={`badge badge-${s.type.toLowerCase()}`}>{s.type}</span>
                    </td>
                    <td>
                      {s.facilities.map(fid => (
                        <span key={fid} className="badge badge-facility">{facilityNameMap[fid] ?? fid}</span>
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
                    <td className="actions">
                      <button onClick={() => handleEdit(s)}>Edit</button>
                      <button className="delete" onClick={() => setDeleteConfirm(s.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalMode && editingStaff && (
        <StaffModal
          staff={editingStaff}
          title={modalMode === 'add' ? 'Add Provider' : 'Edit Provider'}
          facilities={facilityList}
          capabilities={capabilityList}
          onSave={handleSave}
          onClose={() => { setModalMode(null); setEditingStaff(null); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>Are you sure you want to delete this provider? This cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
