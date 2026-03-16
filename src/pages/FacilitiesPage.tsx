import { useState, useEffect } from 'react';
import type { Facility, FacilityCapabilityRequirement } from '../types';
import { getFacilities, saveFacilities, getAllCapabilities, subscribeToStore } from '../store';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emptyFacility(): Facility {
  return {
    id: generateId(),
    name: '',
    weekdayMin: 1,
    weekdayMax: 1,
    saturdayOpen: false,
    saturdayCount: 0,
    sundayOpen: false,
    sundayCount: 0,
    requiredCapabilities: [],
    notes: '',
  };
}

// Format capability requirements for table display
function formatCapabilities(caps: FacilityCapabilityRequirement[]): string[] {
  if (caps.length === 0) return [];
  return caps.map(cap => {
    const dayStr = cap.days.length === 5 && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].every(d => cap.days.includes(d))
      ? 'M-F'
      : cap.days.join(', ');
    return `${cap.capability} (${dayStr})`;
  });
}

// Format weekday provider range for display
function formatWeekdayProviders(min: number, max: number): string {
  if (min === max) return `${min} provider${min !== 1 ? 's' : ''}`;
  return `${min}-${max} providers`;
}

// Modal form for add/edit
function FacilityModal({
  facility,
  title,
  existingCapabilities,
  onSave,
  onClose,
}: {
  facility: Facility;
  title: string;
  existingCapabilities: string[];
  onSave: (f: Facility) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Facility>({
    ...facility,
    requiredCapabilities: facility.requiredCapabilities.map(rc => ({ ...rc, days: [...rc.days] })),
  });
  const [newCapName, setNewCapName] = useState('');

  const updateField = <K extends keyof Facility>(key: K, val: Facility[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const toggleCapDay = (capIndex: number, day: string) => {
    const caps = form.requiredCapabilities.map((cap, i) => {
      if (i !== capIndex) return cap;
      const days = cap.days.includes(day)
        ? cap.days.filter(d => d !== day)
        : [...cap.days, day];
      return { ...cap, days };
    });
    updateField('requiredCapabilities', caps);
  };

  const removeCapability = (capIndex: number) => {
    const caps = form.requiredCapabilities.filter((_, i) => i !== capIndex);
    updateField('requiredCapabilities', caps);
  };

  const addCapability = () => {
    const name = newCapName.trim();
    if (!name) return;
    // Don't add duplicate
    if (form.requiredCapabilities.some(c => c.capability.toLowerCase() === name.toLowerCase())) return;
    updateField('requiredCapabilities', [...form.requiredCapabilities, { capability: name, days: [] }]);
    setNewCapName('');
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave(form);
  };

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
            <label className="form-label">Facility Name</label>
            <input
              className="form-input"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="e.g. Main Campus, Downtown Clinic"
            />
          </div>

          {/* Weekday Providers */}
          <div className="form-group">
            <label className="form-label">Weekday Providers Needed</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>Min</label>
                <input
                  type="number"
                  className="count-input"
                  min={0}
                  max={20}
                  value={form.weekdayMin}
                  onChange={e => updateField('weekdayMin', Number(e.target.value))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>Max</label>
                <input
                  type="number"
                  className="count-input"
                  min={0}
                  max={20}
                  value={form.weekdayMax}
                  onChange={e => updateField('weekdayMax', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Weekend Coverage */}
          <div className="form-group">
            <label className="form-label">Weekend Coverage</label>
            <div style={{ display: 'flex', gap: 24 }}>
              <div className="weekend-box">
                <label className="weekend-toggle">
                  <input
                    type="checkbox"
                    checked={form.saturdayOpen}
                    onChange={e => {
                      updateField('saturdayOpen', e.target.checked);
                      if (!e.target.checked) updateField('saturdayCount', 0);
                    }}
                  />
                  <strong>Saturday</strong>
                </label>
                <div style={{ opacity: form.saturdayOpen ? 1 : 0.4 }}>
                  <label style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>Providers needed</label>
                  <input
                    type="number"
                    className="count-input"
                    min={0}
                    max={20}
                    value={form.saturdayCount}
                    onChange={e => updateField('saturdayCount', Number(e.target.value))}
                    disabled={!form.saturdayOpen}
                  />
                </div>
              </div>
              <div className="weekend-box">
                <label className="weekend-toggle">
                  <input
                    type="checkbox"
                    checked={form.sundayOpen}
                    onChange={e => {
                      updateField('sundayOpen', e.target.checked);
                      if (!e.target.checked) updateField('sundayCount', 0);
                    }}
                  />
                  <strong>Sunday</strong>
                </label>
                <div style={{ opacity: form.sundayOpen ? 1 : 0.4 }}>
                  <label style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>Providers needed</label>
                  <input
                    type="number"
                    className="count-input"
                    min={0}
                    max={20}
                    value={form.sundayCount}
                    onChange={e => updateField('sundayCount', Number(e.target.value))}
                    disabled={!form.sundayOpen}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Required Capabilities */}
          <div className="form-group">
            <label className="form-label">Required Capabilities</label>
            <div className="cap-grid-container">
              {form.requiredCapabilities.length > 0 && (
                <table className="cap-grid">
                  <thead>
                    <tr>
                      <th></th>
                      {WEEKDAYS.map(d => <th key={d}>{d}</th>)}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.requiredCapabilities.map((cap, i) => (
                      <tr key={i}>
                        <td>{cap.capability}</td>
                        {WEEKDAYS.map(d => (
                          <td key={d}>
                            <input
                              type="checkbox"
                              checked={cap.days.includes(d)}
                              onChange={() => toggleCapDay(i, d)}
                            />
                          </td>
                        ))}
                        <td>
                          <button className="cap-remove" onClick={() => removeCapability(i)} title="Remove capability">&times;</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* Existing capabilities dropdown */}
              {(() => {
                const unused = existingCapabilities.filter(
                  c => !form.requiredCapabilities.some(rc => rc.capability.toLowerCase() === c.toLowerCase())
                );
                return unused.length > 0 ? (
                  <div className="cap-add-row">
                    <select
                      className="cap-add-input"
                      value=""
                      onChange={e => {
                        if (e.target.value) {
                          updateField('requiredCapabilities', [
                            ...form.requiredCapabilities,
                            { capability: e.target.value, days: [] },
                          ]);
                        }
                      }}
                    >
                      <option value="">Select existing capability...</option>
                      {unused.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ) : null;
              })()}
              {/* New capability text input */}
              <div className="cap-add-row">
                <input
                  type="text"
                  className="cap-add-input"
                  value={newCapName}
                  onChange={e => setNewCapName(e.target.value)}
                  placeholder="Or type new capability name..."
                  onKeyDown={e => { if (e.key === 'Enter') addCapability(); }}
                />
                <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={addCapability}>Add</button>
              </div>
            </div>
            <div className="form-hint">Capabilities defined here are available to assign to providers on the Staff page.</div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Notes <span className="form-label-sub">(optional)</span></label>
            <textarea
              className="form-textarea"
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Any special rules or reminders about this facility..."
            />
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

export default function FacilitiesPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setFacilities(getFacilities());
    load();
    return subscribeToStore(load);
  }, []);

  const refreshFacilities = () => {
    setFacilities(getFacilities());
  };

  const handleAdd = () => {
    setEditingFacility(emptyFacility());
    setModalMode('add');
  };

  const handleEdit = (f: Facility) => {
    setEditingFacility(f);
    setModalMode('edit');
  };

  const handleSave = (f: Facility) => {
    const all = getFacilities();
    if (modalMode === 'add') {
      all.push(f);
    } else {
      const idx = all.findIndex(x => x.id === f.id);
      if (idx >= 0) all[idx] = f;
    }
    saveFacilities(all);
    refreshFacilities();
    setModalMode(null);
    setEditingFacility(null);
  };

  const handleDelete = (id: string) => {
    const all = getFacilities().filter(f => f.id !== id);
    saveFacilities(all);
    refreshFacilities();
    setDeleteConfirm(null);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Facilities</h2>
          <p>Manage locations, coverage requirements, and capabilities</p>
        </div>
        <button className="btn-primary" onClick={handleAdd}>+ Add Facility</button>
      </div>

      <div className="content">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Weekday Providers</th>
                <th>Saturday</th>
                <th>Sunday</th>
                <th>Required Capabilities</th>
                <th>Actions</th>
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
                        <span>{formatWeekdayProviders(f.weekdayMin, f.weekdayMax)}</span>
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
                        ? caps.map(c => <span key={c} className="badge badge-cap" style={{ marginRight: 3 }}>{c}</span>)
                        : <span>&mdash;</span>
                      }
                    </td>
                    <td className="actions">
                      <button onClick={() => handleEdit(f)}>Edit</button>
                      <button className="delete" onClick={() => setDeleteConfirm(f.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalMode && editingFacility && (
        <FacilityModal
          facility={editingFacility}
          title={modalMode === 'add' ? 'Add Facility' : 'Edit Facility'}
          existingCapabilities={getAllCapabilities()}
          onSave={handleSave}
          onClose={() => { setModalMode(null); setEditingFacility(null); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>Are you sure you want to delete this facility? This cannot be undone.</p>
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
