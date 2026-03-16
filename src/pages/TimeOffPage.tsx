import { useState, useEffect } from 'react';
import type { TimeOffRequest } from '../types';
import { getTimeOff, saveTimeOff, getStaff, subscribeToStore } from '../store';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emptyRequest(): TimeOffRequest {
  return {
    id: generateId(),
    staffId: '',
    startDate: '',
    endDate: '',
    notes: '',
  };
}

// Format date for display (e.g. "May 11, 2026")
function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Get month options from existing requests + current month
function getMonthOptions(requests: TimeOffRequest[]): { value: string; label: string }[] {
  const months = new Set<string>();
  // Always include current month
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  // Add months from existing requests
  requests.forEach(r => {
    if (r.startDate) {
      const d = new Date(r.startDate + 'T00:00:00');
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    if (r.endDate) {
      const d = new Date(r.endDate + 'T00:00:00');
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  });
  return [
    { value: '', label: 'All Months' },
    ...Array.from(months).sort().map(m => {
      const [year, month] = m.split('-');
      const d = new Date(Number(year), Number(month) - 1, 1);
      return { value: m, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    }),
  ];
}

// Check if a request overlaps with a given month (YYYY-MM)
function overlapsMonth(r: TimeOffRequest, monthFilter: string): boolean {
  if (!monthFilter) return true;
  const [year, month] = monthFilter.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // last day of month
  const start = new Date(r.startDate + 'T00:00:00');
  const end = new Date(r.endDate + 'T00:00:00');
  return start <= monthEnd && end >= monthStart;
}

// Modal form for add/edit
function TimeOffModal({
  request,
  title,
  staffList,
  onSave,
  onClose,
}: {
  request: TimeOffRequest;
  title: string;
  staffList: { id: string; name: string }[];
  onSave: (r: TimeOffRequest) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TimeOffRequest>({ ...request });

  const updateField = <K extends keyof TimeOffRequest>(key: K, val: TimeOffRequest[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.staffId || !form.startDate || !form.endDate) return;
    // Ensure end >= start
    if (form.endDate < form.startDate) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {/* Provider */}
          <div className="form-group">
            <label className="form-label">Provider</label>
            <select
              className="form-select"
              value={form.staffId}
              onChange={e => updateField('staffId', e.target.value)}
            >
              <option value="">-- Select Provider --</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="form-group">
            <label className="form-label">Date Range</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>Start</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.startDate}
                  onChange={e => {
                    updateField('startDate', e.target.value);
                    // Auto-set end date if empty or before start
                    if (!form.endDate || form.endDate < e.target.value) {
                      updateField('endDate', e.target.value);
                    }
                  }}
                />
              </div>
              <span style={{ color: '#999', marginTop: 20 }}>to</span>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>End</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={e => updateField('endDate', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Notes <span className="form-label-sub">(optional)</span></label>
            <textarea
              className="form-textarea"
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Reason or details..."
              style={{ minHeight: 60 }}
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

export default function TimeOffPage() {
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const [monthFilter, setMonthFilter] = useState('');
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingRequest, setEditingRequest] = useState<TimeOffRequest | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      setRequests(getTimeOff());
      setStaffList(getStaff().map(s => ({ id: s.id, name: s.name })));
    };
    load();
    return subscribeToStore(load);
  }, []);

  const refreshRequests = () => {
    setRequests(getTimeOff());
  };

  const handleAdd = () => {
    setEditingRequest(emptyRequest());
    setModalMode('add');
  };

  const handleEdit = (r: TimeOffRequest) => {
    setEditingRequest(r);
    setModalMode('edit');
  };

  const handleSave = (r: TimeOffRequest) => {
    const all = getTimeOff();
    if (modalMode === 'add') {
      all.push(r);
    } else {
      const idx = all.findIndex(x => x.id === r.id);
      if (idx >= 0) all[idx] = r;
    }
    saveTimeOff(all);
    refreshRequests();
    setModalMode(null);
    setEditingRequest(null);
  };

  const handleDelete = (id: string) => {
    const all = getTimeOff().filter(r => r.id !== id);
    saveTimeOff(all);
    refreshRequests();
    setDeleteConfirm(null);
  };

  // Build staff name lookup
  const staffNameMap = Object.fromEntries(staffList.map(s => [s.id, s.name]));

  // Filter requests by month
  const filtered = requests.filter(r => overlapsMonth(r, monthFilter));
  const monthOptions = getMonthOptions(requests);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Time Off</h2>
          <p>Manage PTO and unavailability requests</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select
            className="form-select"
            style={{ width: 200 }}
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
          >
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={handleAdd}>+ Add Time Off</button>
        </div>
      </div>

      <div className="content">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#999', padding: 32 }}>
                    {requests.length === 0
                      ? 'No time off requests yet. Click "+ Add Time Off" to add one.'
                      : 'No requests match the selected month.'
                    }
                  </td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id}>
                    <td><strong>{staffNameMap[r.staffId] ?? r.staffId}</strong></td>
                    <td>{formatDate(r.startDate)}</td>
                    <td>{formatDate(r.endDate)}</td>
                    <td>{r.notes || <span style={{ color: '#999' }}>&mdash;</span>}</td>
                    <td className="actions">
                      <button onClick={() => handleEdit(r)}>Edit</button>
                      <button className="delete" onClick={() => setDeleteConfirm(r.id)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalMode && editingRequest && (
        <TimeOffModal
          request={editingRequest}
          title={modalMode === 'add' ? 'Add Time Off' : 'Edit Time Off'}
          staffList={staffList}
          onSave={handleSave}
          onClose={() => { setModalMode(null); setEditingRequest(null); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>Are you sure you want to delete this time off request? This cannot be undone.</p>
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
