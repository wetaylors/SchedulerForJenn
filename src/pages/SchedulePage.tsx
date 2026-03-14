import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StaffMember, Facility, TimeOffRequest } from '../types';
import { getStaff, getFacilities, getTimeOff, getSettings, getSchedule, saveSchedule, getRuleToggles } from '../store';
import type { SavedSchedule, SavedScheduleDay } from '../store';
import {
  generateSchedule,
  buildCalendarDays,
  checkPrefViolation,
  getViolatedPreferences,
  runPreflightCheck,
  getDayName,
  isOnPTO,
} from '../scheduler';
import type { Assignment, DayData, PreflightWarning } from '../scheduler';

type ScheduleState = 'blank' | 'generated';

// --- Helpers ---

const FACILITY_COLORS: Record<number, { bg: string; color: string }> = {
  0: { bg: '#dbeafe', color: '#1e40af' },
  1: { bg: '#fce7f3', color: '#9d174d' },
  2: { bg: '#d1fae5', color: '#065f46' },
  3: { bg: '#fef3c7', color: '#92400e' },
  4: { bg: '#e0e7ff', color: '#3730a3' },
  5: { bg: '#fdf2f8', color: '#831843' },
};

function getFacilityColor(facilityId: string, facilities: Facility[]): { bg: string; color: string } {
  const idx = facilities.findIndex(f => f.id === facilityId);
  return FACILITY_COLORS[idx >= 0 ? idx % Object.keys(FACILITY_COLORS).length : 0];
}


// --- Persistence helpers ---

function daysToSaved(days: DayData[], state: ScheduleState): SavedSchedule {
  const savedDays: SavedScheduleDay[] = days
    .filter(d => d.isCurrentMonth)
    .map(d => ({
      dateISO: d.date.toISOString().slice(0, 10),
      assignments: d.assignments.map(a => ({
        staffId: a.staffId,
        facilityId: a.facilityId,
        pinned: a.pinned,
        prefViolation: a.prefViolation,
      })),
      coverageIssue: d.coverageIssue,
      coverageAccepted: d.coverageAccepted,
    }));
  return { state, days: savedDays };
}

function loadSavedIntoDays(saved: SavedSchedule, year: number, month: number): DayData[] {
  const calDays = buildCalendarDays(year, month);
  const savedMap = new Map(saved.days.map(sd => [sd.dateISO, sd]));
  for (const day of calDays) {
    if (!day.isCurrentMonth) continue;
    const dateKey = day.date.toISOString().slice(0, 10);
    const sd = savedMap.get(dateKey);
    if (sd) {
      day.assignments = sd.assignments.map(a => ({ ...a }));
      day.coverageIssue = sd.coverageIssue;
      day.coverageAccepted = sd.coverageAccepted;
    }
  }
  return calDays;
}

// --- PTO injection for blank/cleared schedules ---
function injectPTO(days: DayData[], staffList: StaffMember[], timeOff: TimeOffRequest[]): DayData[] {
  return days.map(day => {
    if (!day.isCurrentMonth) return day;
    const ptoAssignments: Assignment[] = [];
    for (const s of staffList) {
      // Don't duplicate if already has assignments for this staff
      if (day.assignments.some(a => a.staffId === s.id)) continue;
      if (isOnPTO(s.id, day.date, timeOff)) {
        ptoAssignments.push({ staffId: s.id, facilityId: '__pto__', pinned: false, prefViolation: false });
      }
    }
    if (ptoAssignments.length > 0) {
      return { ...day, assignments: [...day.assignments, ...ptoAssignments] };
    }
    return day;
  });
}

// --- Split week carryover for month boundaries ---
function computeSplitWeekCarryover(
  year: number, month: number, patternStart: string
): Map<string, number> {
  const carryover = new Map<string, number>();

  // If pattern starts on 1st of this month, no carryover
  const monthFirstISO = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  if (patternStart === monthFirstISO) return carryover;

  // Check if 1st day of month is not Monday
  const firstDay = new Date(year, month, 1);
  const dow = firstDay.getDay();
  if (dow <= 1) return carryover; // Sunday(0) or Monday(1) — no split week

  // Look up previous month's schedule
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevSchedule = getSchedule(prevYear, prevMonth);
  if (!prevSchedule || prevSchedule.state !== 'generated') return carryover;

  // Find the Monday of the week containing the 1st
  const monday = new Date(firstDay);
  monday.setDate(monday.getDate() - (dow - 1));

  // Count working days from Monday to day-before-1st from previous month's schedule
  for (let d = new Date(monday); d < firstDay; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateISO = d.toISOString().slice(0, 10);
    const dayData = prevSchedule.days.find(sd => sd.dateISO === dateISO);
    if (dayData) {
      for (const a of dayData.assignments) {
        if (a.facilityId !== '__pto__' && a.facilityId !== '__off__') {
          carryover.set(a.staffId, (carryover.get(a.staffId) ?? 0) + 1);
        }
      }
    }
  }

  return carryover;
}

// --- Component ---

export default function SchedulePage() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [scheduleState, setScheduleState] = useState<ScheduleState>('blank');
  const [days, setDays] = useState<DayData[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [timeOffList, setTimeOffList] = useState<TimeOffRequest[]>([]);
  const [patternStart, setPatternStart] = useState('');

  // Pinned assignments (persisted across generate/regenerate)
  const [pinnedAssignments, setPinnedAssignments] = useState<Map<string, Assignment[]>>(new Map());

  // Filter
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());

  // Popups
  const [activePopup, setActivePopup] = useState<{ type: 'assignment' | 'add' | 'coverage'; dateKey: string; assignmentIndex?: number; x: number; y: number } | null>(null);
  const [addForm, setAddForm] = useState<{ staffId: string; facilityId: string }>({ staffId: '', facilityId: '' });

  // Pre-flight modal
  const [showPreflight, setShowPreflight] = useState(false);
  const [preflightWarnings, setPreflightWarnings] = useState<PreflightWarning[]>([]);

  // Change facility dropdown
  const [changeFacilityId, setChangeFacilityId] = useState('');

  // Clear confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const popupRef = useRef<HTMLDivElement>(null);

  // Load data
  useEffect(() => {
    const s = getStaff();
    const f = getFacilities();
    const t = getTimeOff();
    const settings = getSettings();
    setStaff(s);
    setFacilities(f);
    setTimeOffList(t);
    setPatternStart(settings.patternStartDate);

    // Check for saved schedule for this month
    const saved = getSchedule(year, month);
    if (saved) {
      setDays(loadSavedIntoDays(saved, year, month));
      setScheduleState(saved.state);
      // Rebuild pinned map from saved data
      const pins = new Map<string, Assignment[]>();
      for (const sd of saved.days) {
        const pinned = sd.assignments.filter(a => a.pinned && a.facilityId !== '__off__' && a.facilityId !== '__pto__');
        if (pinned.length > 0) pins.set(sd.dateISO, pinned.map(a => ({ ...a })));
      }
      setPinnedAssignments(pins);
    } else {
      setDays(injectPTO(buildCalendarDays(year, month), s, t));
    }
  }, []);

  // Close popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setActivePopup(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Save schedule to localStorage whenever it changes
  const persistDays = (newDays: DayData[], newState: ScheduleState) => {
    saveSchedule(year, month, daysToSaved(newDays, newState));
  };

  // Update days + persist in one call
  const updateAndPersist = (updater: (prev: DayData[]) => DayData[]) => {
    setDays(prev => {
      const next = updater(prev);
      persistDays(next, scheduleState);
      return next;
    });
  };

  const loadMonth = (newYear: number, newMonth: number) => {
    setActivePopup(null);
    setYear(newYear);
    setMonth(newMonth);
    const saved = getSchedule(newYear, newMonth);
    if (saved) {
      setDays(loadSavedIntoDays(saved, newYear, newMonth));
      setScheduleState(saved.state);
      const pins = new Map<string, Assignment[]>();
      for (const sd of saved.days) {
        const pinned = sd.assignments.filter(a => a.pinned && a.facilityId !== '__off__' && a.facilityId !== '__pto__');
        if (pinned.length > 0) pins.set(sd.dateISO, pinned.map(a => ({ ...a })));
      }
      setPinnedAssignments(pins);
    } else {
      const freshStaff = getStaff();
      const freshTimeOff = getTimeOff();
      setDays(injectPTO(buildCalendarDays(newYear, newMonth), freshStaff, freshTimeOff));
      setScheduleState('blank');
      setPinnedAssignments(new Map());
    }
  };

  const prevMonth = () => {
    if (month === 0) loadMonth(year - 1, 11);
    else loadMonth(year, month - 1);
  };

  const nextMonth = () => {
    if (month === 11) loadMonth(year + 1, 0);
    else loadMonth(year, month + 1);
  };

  // --- Generate ---
  const handleGenerate = () => {
    // Re-read fresh data for preflight check
    const freshStaff = getStaff();
    const freshFacilities = getFacilities();
    const freshTimeOff = getTimeOff();
    const freshSettings = getSettings();
    setStaff(freshStaff);
    setFacilities(freshFacilities);
    setTimeOffList(freshTimeOff);
    setPatternStart(freshSettings.patternStartDate);

    const warnings = runPreflightCheck(year, month, freshStaff, freshFacilities, freshTimeOff, freshSettings.patternStartDate);
    if (warnings.length > 0) {
      setPreflightWarnings(warnings);
      setShowPreflight(true);
    } else {
      doGenerate();
    }
  };

  const doGenerate = () => {
    // Re-read from localStorage to pick up any edits made on other pages
    const freshStaff = getStaff();
    const freshFacilities = getFacilities();
    const freshTimeOff = getTimeOff();
    const freshSettings = getSettings();
    setStaff(freshStaff);
    setFacilities(freshFacilities);
    setTimeOffList(freshTimeOff);
    setPatternStart(freshSettings.patternStartDate);

    // Bug #1 fix: rebuild pins from current days (handles pins added on blank schedule)
    const pins = new Map<string, Assignment[]>();
    for (const day of days) {
      if (!day.isCurrentMonth) continue;
      const dateKey = day.date.toISOString().slice(0, 10);
      const pinned = day.assignments.filter(a => a.pinned && a.facilityId !== '__off__' && a.facilityId !== '__pto__');
      if (pinned.length > 0) {
        pins.set(dateKey, pinned.map(a => ({ ...a })));
      }
    }
    setPinnedAssignments(pins);

    const ruleToggles = getRuleToggles();
    const carryover = computeSplitWeekCarryover(year, month, freshSettings.patternStartDate);
    const result = generateSchedule(year, month, freshStaff, freshFacilities, freshTimeOff, freshSettings.patternStartDate, pins, ruleToggles, carryover);
    setDays(result);
    setScheduleState('generated');
    setShowPreflight(false);
    persistDays(result, 'generated');
  };

  const handleRegenerate = () => {
    // Collect current pins
    const pins = new Map<string, Assignment[]>();
    for (const day of days) {
      if (!day.isCurrentMonth) continue;
      const dateKey = day.date.toISOString().slice(0, 10);
      const pinned = day.assignments.filter(a => a.pinned && a.facilityId !== '__off__' && a.facilityId !== '__pto__');
      if (pinned.length > 0) {
        pins.set(dateKey, pinned);
      }
    }
    setPinnedAssignments(pins);
    // Re-read from localStorage to pick up any edits made on other pages
    const freshStaff = getStaff();
    const freshFacilities = getFacilities();
    const freshTimeOff = getTimeOff();
    const freshSettings = getSettings();
    setStaff(freshStaff);
    setFacilities(freshFacilities);
    setTimeOffList(freshTimeOff);
    setPatternStart(freshSettings.patternStartDate);

    const ruleToggles = getRuleToggles();
    const carryover = computeSplitWeekCarryover(year, month, freshSettings.patternStartDate);
    const result = generateSchedule(year, month, freshStaff, freshFacilities, freshTimeOff, freshSettings.patternStartDate, pins, ruleToggles, carryover);
    setDays(result);
    persistDays(result, 'generated');
  };

  const handleClear = () => {
    const freshStaff = getStaff();
    const freshTimeOff = getTimeOff();
    const blankDays = injectPTO(buildCalendarDays(year, month), freshStaff, freshTimeOff);
    setDays(blankDays);
    setStaff(freshStaff);
    setTimeOffList(freshTimeOff);
    setScheduleState('blank');
    setPinnedAssignments(new Map());
    saveSchedule(year, month, daysToSaved(blankDays, 'blank'));
    setShowClearConfirm(false);
    setActivePopup(null);
  };

  // --- Pin management ---
  const getPinnedCount = (): number => {
    let count = 0;
    for (const day of days) {
      count += day.assignments.filter(a => a.pinned).length;
    }
    return count;
  };

  const getPinnedSummary = (): string => {
    const items: string[] = [];
    for (const day of days) {
      if (!day.isCurrentMonth) continue;
      for (const a of day.assignments) {
        if (a.pinned) {
          const sName = staff.find(s => s.id === a.staffId)?.name ?? a.staffId;
          const fName = facilities.find(f => f.id === a.facilityId)?.name ?? a.facilityId;
          const dateStr = day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          items.push(`${sName} at ${fName} on ${dateStr}`);
        }
      }
    }
    return items.join(', ');
  };

  // --- Coverage issues ---
  const getCoverageIssueCount = (): number => {
    return days.filter(d => d.isCurrentMonth && d.coverageIssue && !d.coverageAccepted).length;
  };

  const acceptCoverage = (dayIndex: number) => {
    updateAndPersist(prev => prev.map((d, i) => i === dayIndex ? { ...d, coverageAccepted: true } : d));
    setActivePopup(null);
  };

  // --- Assignment actions ---
  const openAssignmentPopup = (dateKey: string, assignmentIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const y = window.innerHeight - rect.bottom < 200 ? rect.top - 200 : rect.bottom;
    const x = Math.min(rect.left, window.innerWidth - 260);

    const day = days.find(d => d.isCurrentMonth && d.date.toISOString().slice(0, 10) === dateKey);
    const assignment = day?.assignments[assignmentIndex];
    if (assignment) {
      setChangeFacilityId(assignment.facilityId);
    }

    setActivePopup({ type: 'assignment', dateKey, assignmentIndex, x, y });
  };

  const openAddPopup = (dateKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const y = window.innerHeight - rect.bottom < 200 ? rect.top - 200 : rect.bottom;
    const x = Math.min(rect.left, window.innerWidth - 240);
    setAddForm({ staffId: '', facilityId: facilities[0]?.id ?? '' });
    setActivePopup({ type: 'add', dateKey, x, y });
  };

  const openCoveragePopup = (dateKey: string, dayIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const y = window.innerHeight - rect.bottom < 200 ? rect.top - 200 : rect.bottom;
    const x = Math.min(rect.left, window.innerWidth - 280);
    setActivePopup({ type: 'coverage', dateKey, assignmentIndex: dayIndex, x, y });
  };

  const pinAssignment = (dateKey: string, assignmentIndex: number) => {
    updateAndPersist(prev => prev.map(d => {
      if (!d.isCurrentMonth || d.date.toISOString().slice(0, 10) !== dateKey) return d;
      return {
        ...d,
        assignments: d.assignments.map((a, i) => i === assignmentIndex ? { ...a, pinned: true } : a),
      };
    }));
    setActivePopup(null);
  };

  const unpinAssignment = (dateKey: string, assignmentIndex: number) => {
    updateAndPersist(prev => prev.map(d => {
      if (!d.isCurrentMonth || d.date.toISOString().slice(0, 10) !== dateKey) return d;
      return {
        ...d,
        assignments: d.assignments.map((a, i) => i === assignmentIndex ? { ...a, pinned: false } : a),
      };
    }));
    setActivePopup(null);
  };

  const removeAssignment = (dateKey: string, assignmentIndex: number) => {
    updateAndPersist(prev => prev.map(d => {
      if (!d.isCurrentMonth || d.date.toISOString().slice(0, 10) !== dateKey) return d;
      return {
        ...d,
        assignments: d.assignments.filter((_, i) => i !== assignmentIndex),
      };
    }));
    setActivePopup(null);
  };

  const changeFacility = (dateKey: string, assignmentIndex: number) => {
    updateAndPersist(prev => prev.map(d => {
      if (!d.isCurrentMonth || d.date.toISOString().slice(0, 10) !== dateKey) return d;
      return {
        ...d,
        assignments: d.assignments.map((a, i) =>
          i === assignmentIndex ? { ...a, facilityId: changeFacilityId, pinned: true } : a
        ),
      };
    }));
    setActivePopup(null);
  };

  const addAssignment = (dateKey: string) => {
    if (!addForm.staffId || !addForm.facilityId) return;
    updateAndPersist(prev => prev.map(d => {
      if (!d.isCurrentMonth || d.date.toISOString().slice(0, 10) !== dateKey) return d;
      return {
        ...d,
        assignments: [
          ...d.assignments.filter(a => a.staffId !== addForm.staffId),
          { staffId: addForm.staffId, facilityId: addForm.facilityId, pinned: true, prefViolation: false },
        ],
      };
    }));
    setActivePopup(null);
  };

  // --- Filter ---
  const toggleProvider = (id: string) => {
    setHiddenProviders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const showAll = () => setHiddenProviders(new Set());
  const showNone = () => setHiddenProviders(new Set(staff.map(s => s.id)));

  // --- Render helpers ---
  const staffName = (id: string) => staff.find(s => s.id === id)?.name ?? id;
  const facName = (id: string) => {
    if (id === '__off__') return 'OFF';
    if (id === '__pto__') return 'PTO';
    return facilities.find(f => f.id === id)?.name ?? id;
  };

  const getAssignmentClass = (a: Assignment): string => {
    if (a.facilityId === '__off__') return 'assign off-assign';
    if (a.facilityId === '__pto__') return 'assign pto-assign';
    let cls = 'assign';
    if (a.pinned) cls += ' pinned-assign';
    if (a.prefViolation) cls += ' pref-violation-assign';
    return cls;
  };

  const getAssignmentStyle = (a: Assignment): React.CSSProperties => {
    if (a.facilityId === '__off__' || a.facilityId === '__pto__') return {};
    const col = getFacilityColor(a.facilityId, facilities);
    return { background: col.bg, color: col.color };
  };

  const pinnedCount = getPinnedCount();
  const issueCount = getCoverageIssueCount();

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Monthly Schedule</h2>
          <p>
            {scheduleState === 'blank'
              ? 'Pre-load any special assignments, then click Generate to fill the rest.'
              : 'Click any assignment to edit. Pinned assignments stay fixed when you regenerate.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sched-month-nav">
            <button onClick={prevMonth}>&lt; {new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' })}</button>
            <span>{monthLabel}</span>
            <button onClick={nextMonth}>{new Date(year, month + 1, 1).toLocaleDateString('en-US', { month: 'short' })} &gt;</button>
          </div>
          {scheduleState === 'blank' ? (
            <button className="btn-sched-generate" onClick={handleGenerate} disabled={!patternStart}>Generate Schedule</button>
          ) : (
            <>
              <button className="btn-sched-regenerate" onClick={handleRegenerate}>Regenerate</button>
              <button className="btn-sched-clear" onClick={() => setShowClearConfirm(true)}>Clear</button>
            </>
          )}
        </div>
      </div>

      {/* Pattern start warning is now shown as an overlay on the calendar */}

      {/* Pin bar */}
      {pinnedCount > 0 && (
        <div className="sched-pin-bar">
          <div><strong>{pinnedCount} pinned assignment{pinnedCount !== 1 ? 's' : ''}</strong> &mdash; {getPinnedSummary()}</div>
          <div className="sched-pin-hint">Click any assignment to edit, or "+ Add" to add a provider</div>
        </div>
      )}

      {/* Coverage issues bar */}
      {scheduleState === 'generated' && issueCount > 0 && (
        <div className="sched-issues-bar">
          <div><strong>{issueCount} coverage issue{issueCount !== 1 ? 's' : ''}</strong> &mdash; Click flashing days to review and accept</div>
        </div>
      )}

      {/* Provider filter bar */}
      <div className="sched-filter-bar">
        <span className="sched-filter-label">Show:</span>
        {staff.map(s => (
          <span
            key={s.id}
            className={`sched-filter-chip ${hiddenProviders.has(s.id) ? 'off' : ''}`}
            onClick={() => toggleProvider(s.id)}
          >
            {s.name}
          </span>
        ))}
        <div className="sched-filter-divider"></div>
        <button className="sched-filter-btn" onClick={showAll}>Show All</button>
        <button className="sched-filter-btn" onClick={showNone}>Show None</button>
      </div>

      {/* Calendar */}
      <div className="sched-container" style={{ position: 'relative' }}>
        {/* Pattern start date overlay — blocks interaction until configured */}
        {!patternStart && (
          <div className="sched-pattern-overlay">
            <div className="sched-pattern-overlay-box">
              <h3 style={{ margin: '0 0 12px 0', fontSize: 18 }}>2-Week Pattern Start Date Required</h3>
              <p style={{ margin: '0 0 16px 0', lineHeight: 1.5, color: '#555' }}>
                The schedule can't be generated until a pattern start date is set.
                This date determines which week is Week 1 vs Week 2 for part-time
                providers who work a different number of days in alternating weeks.
              </p>
              <button className="btn-primary" onClick={() => navigate('/settings')}>Go to Settings</button>
            </div>
          </div>
        )}
        <div className="sched-calendar">
          <div className="sched-cal-header">
            <div>Sunday</div><div>Monday</div><div>Tuesday</div><div>Wednesday</div><div>Thursday</div><div>Friday</div><div>Saturday</div>
          </div>
          <div className="sched-cal-grid">
            {days.map((day, dayIndex) => {
              const dateKey = day.isCurrentMonth ? day.date.toISOString().slice(0, 10) : '';
              const isFlashing = day.isCurrentMonth && day.coverageIssue && !day.coverageAccepted;
              const isAccepted = day.isCurrentMonth && day.coverageIssue && day.coverageAccepted;

              let cellClass = 'sched-day';
              if (!day.isCurrentMonth) cellClass += ' sched-day-empty';
              if (day.isWeekend) cellClass += ' sched-day-weekend';
              if (isFlashing) cellClass += ' sched-day-flash';
              if (isAccepted) cellClass += ' sched-day-accepted';

              return (
                <div
                  key={dayIndex}
                  className={cellClass}
                  onClick={isFlashing ? (e) => openCoveragePopup(dateKey, dayIndex, e) : undefined}
                >
                  {day.isCurrentMonth && (
                    <>
                      <div className="sched-day-num">{day.dayOfMonth}</div>
                      {isFlashing && (
                        <div className="sched-coverage-badge">{day.coverageIssue}</div>
                      )}
                      {day.assignments.map((a, ai) => {
                        const isHidden = hiddenProviders.has(a.staffId);
                        return (
                          <div
                            key={ai}
                            className={`${getAssignmentClass(a)}${isHidden ? ' assign-filtered' : ''}`}
                            style={isHidden ? {} : getAssignmentStyle(a)}
                            onClick={a.facilityId !== '__off__' && a.facilityId !== '__pto__' && !isFlashing
                              ? (e) => openAssignmentPopup(dateKey, ai, e)
                              : undefined
                            }
                          >
                            <span className="assign-name">{staffName(a.staffId)}</span>
                            <span>
                              {facName(a.facilityId)}
                              {a.pinned && ' \uD83D\uDCCC'}
                            </span>
                          </div>
                        );
                      })}
                      {!day.isSunday && (
                        <button className="sched-add-btn" onClick={(e) => openAddPopup(dateKey, e)}>+ Add</button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="sched-legend">
            <strong>Legend:</strong>
            {facilities.map((f, i) => {
              const col = FACILITY_COLORS[i % Object.keys(FACILITY_COLORS).length];
              return (
                <div key={f.id} className="sched-legend-item">
                  <div className="sched-legend-swatch" style={{ background: col.bg }}></div>
                  {f.name}
                </div>
              );
            })}
            <div className="sched-legend-item">
              <div className="sched-legend-swatch" style={{ background: '#e5e7eb' }}></div>
              PTO
            </div>
            <div className="sched-legend-item">
              <div className="sched-legend-swatch" style={{ background: '#f3f4f6' }}></div>
              Scheduled Off
            </div>
            <div className="sched-legend-item">
              <div className="sched-legend-swatch sched-legend-pinned"></div>
              Pinned
            </div>
            <div className="sched-legend-item">
              <div className="sched-legend-swatch" style={{ background: 'white', border: '1px solid #ddd', borderLeft: '3px solid #ef4444' }}></div>
              Preference Violated
            </div>
            <div className="sched-legend-item">
              <div className="sched-legend-swatch sched-legend-flash"></div>
              Coverage Not Met
            </div>
          </div>
        </div>
      </div>

      {/* --- Popups --- */}
      {activePopup && (
        <div ref={popupRef} style={{ position: 'fixed', top: activePopup.y, left: activePopup.x, zIndex: 200 }}>
          {/* Assignment action popup */}
          {activePopup.type === 'assignment' && activePopup.assignmentIndex !== undefined && (() => {
            const day = days.find(d => d.isCurrentMonth && d.date.toISOString().slice(0, 10) === activePopup.dateKey);
            const a = day?.assignments[activePopup.assignmentIndex!];
            if (!a) return null;
            const provider = staff.find(s => s.id === a.staffId);
            const dayNameStr = getDayName(day!.date);
            const violations = provider && a.prefViolation
              ? getViolatedPreferences(provider, a.facilityId, dayNameStr, facilities)
              : [];
            return (
              <div className="sched-popup">
                <div className="sched-popup-header">
                  {staffName(a.staffId)} &mdash; {facName(a.facilityId)}, {day!.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  <button className="sched-popup-close" onClick={() => setActivePopup(null)}>&times;</button>
                </div>
                {violations.length > 0 && (
                  <div className="sched-pref-violations">
                    {violations.map((v, i) => <div key={i}>&#9888; {v}</div>)}
                  </div>
                )}
                <div className="sched-popup-action">
                  <div className="sched-popup-icon icon-fac">&#8644;</div>
                  Change facility:
                  <select value={changeFacilityId} onChange={e => setChangeFacilityId(e.target.value)} style={{ marginLeft: 4 }}>
                    {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <button className="sched-popup-apply" onClick={() => changeFacility(activePopup.dateKey, activePopup.assignmentIndex!)}>Apply</button>
                </div>
                <div className="sched-popup-action" onClick={() => removeAssignment(activePopup.dateKey, activePopup.assignmentIndex!)}>
                  <div className="sched-popup-icon icon-remove">&#10005;</div>
                  Remove from this day
                </div>
                {a.pinned ? (
                  <div className="sched-popup-action" onClick={() => unpinAssignment(activePopup.dateKey, activePopup.assignmentIndex!)}>
                    <div className="sched-popup-icon icon-unpin">&#128204;</div>
                    Unpin this assignment
                  </div>
                ) : (
                  <div className="sched-popup-action" onClick={() => pinAssignment(activePopup.dateKey, activePopup.assignmentIndex!)}>
                    <div className="sched-popup-icon icon-unpin">&#128204;</div>
                    Pin this assignment
                  </div>
                )}
              </div>
            );
          })()}

          {/* Add provider popup */}
          {activePopup.type === 'add' && (
            <div className="sched-popup">
              <div className="sched-popup-header">
                Add Provider &mdash; {new Date(activePopup.dateKey + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                <button className="sched-popup-close" onClick={() => setActivePopup(null)}>&times;</button>
              </div>
              <div className="sched-popup-row">
                <label>Provider:</label>
                <select value={addForm.staffId} onChange={e => setAddForm(prev => ({ ...prev, staffId: e.target.value }))}>
                  <option value="">--</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="sched-popup-row">
                <label>Facility:</label>
                <select value={addForm.facilityId} onChange={e => setAddForm(prev => ({ ...prev, facilityId: e.target.value }))}>
                  {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="sched-popup-buttons">
                <button className="btn-secondary" style={{ padding: '5px 14px', fontSize: 12 }} onClick={() => setActivePopup(null)}>Cancel</button>
                <button className="btn-primary" style={{ padding: '5px 14px', fontSize: 12 }} onClick={() => addAssignment(activePopup.dateKey)}>Add &amp; Pin</button>
              </div>
            </div>
          )}

          {/* Coverage issue popup */}
          {activePopup.type === 'coverage' && activePopup.assignmentIndex !== undefined && (() => {
            const day = days[activePopup.assignmentIndex!];
            if (!day) return null;
            return (
              <div className="sched-popup sched-popup-coverage">
                <div className="sched-popup-header" style={{ background: '#fef2f2', color: '#991b1b' }}>
                  &#9888; {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} &mdash; Coverage Issue
                  <button className="sched-popup-close" onClick={() => setActivePopup(null)}>&times;</button>
                </div>
                <div style={{ padding: '12px 14px', fontSize: 12, color: '#666', borderBottom: '1px solid #f0f0f0' }}>
                  <strong style={{ color: '#991b1b' }}>{day.coverageIssue}</strong>
                </div>
                <button className="sched-accept-btn" onClick={() => acceptCoverage(activePopup.assignmentIndex!)}>
                  &#10003; Accept &mdash; I'll handle this manually
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Pre-flight Warning Modal */}
      {showPreflight && (
        <div className="sched-modal-overlay">
          <div className="sched-modal">
            <div className="sched-modal-header">
              <div className="sched-modal-warn-icon">&#9888;</div>
              <div>
                <h3>Pre-flight Check &mdash; {monthLabel}</h3>
                <p>The scheduler found potential coverage issues</p>
              </div>
            </div>
            <div className="sched-modal-body">
              {preflightWarnings.map((w, i) => (
                <div key={i} className="sched-warning-item">
                  <div className="sched-warn-dot">&#9679;</div>
                  <div>
                    <div className="sched-warn-date">{w.date}</div>
                    <div className="sched-warn-detail">{w.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="sched-modal-footer">
              <button className="btn-secondary" onClick={() => { setShowPreflight(false); }}>Go Back to Fix</button>
              <button className="btn-sched-generate" onClick={doGenerate}>Generate Anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation */}
      {showClearConfirm && (
        <div className="confirm-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>Clear the entire schedule for {monthLabel}? This will remove all assignments and pins.</p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="btn-danger" onClick={handleClear}>Clear Schedule</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
