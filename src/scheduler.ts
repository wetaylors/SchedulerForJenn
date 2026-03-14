import type { StaffMember, Facility, TimeOffRequest } from './types';

// --- Types ---

export interface Assignment {
  staffId: string;
  facilityId: string;
  pinned: boolean;
  prefViolation: boolean;
}

export interface DayData {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  isSunday: boolean;
  assignments: Assignment[];
  coverageIssue: string | null;
  coverageAccepted: boolean;
}

export interface PreflightWarning {
  date: string;
  detail: string;
}

// --- Helpers ---

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getDayName(date: Date): string {
  return DAY_NAMES[date.getDay()];
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isDateInRange(date: Date, start: string, end: string): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return d >= s && d <= e;
}

export function getPatternWeek(date: Date, patternStart: string): 1 | 2 {
  if (!patternStart) return 1;
  const start = new Date(patternStart + 'T00:00:00');
  const diff = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diff / 7);
  return (weekNum % 2 === 0) ? 1 : 2;
}

export function isOnPTO(staffId: string, date: Date, timeOff: TimeOffRequest[]): boolean {
  return timeOff.some(t => t.staffId === staffId && isDateInRange(date, t.startDate, t.endDate));
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// --- Calendar building ---

export function buildCalendarDays(year: number, month: number): DayData[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const days: DayData[] = [];

  for (let i = 0; i < firstDay; i++) {
    days.push({
      date: new Date(year, month, -(firstDay - 1 - i)),
      dayOfMonth: 0, isCurrentMonth: false, isWeekend: false, isSunday: false,
      assignments: [], coverageIssue: null, coverageAccepted: false,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();
    days.push({
      date, dayOfMonth: d, isCurrentMonth: true,
      isWeekend: dow === 0 || dow === 6, isSunday: dow === 0,
      assignments: [], coverageIssue: null, coverageAccepted: false,
    });
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 0; i < remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i + 1),
        dayOfMonth: 0, isCurrentMonth: false, isWeekend: false, isSunday: false,
        assignments: [], coverageIssue: null, coverageAccepted: false,
      });
    }
  }

  return days;
}

// --- Work week grouping ---

interface WorkWeek {
  monday: Date;
  dates: Date[]; // Weekdays (Mon-Fri) in this week that fall in the current month
  patternWeek: 1 | 2;
}

function getWorkWeeks(year: number, month: number, patternStart: string): WorkWeek[] {
  const weeks: WorkWeek[] = [];
  const daysInMonth = getDaysInMonth(year, month);

  let currentMondayKey = '';
  let currentMonday: Date | null = null;
  let currentDates: Date[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;

    const monday = new Date(date);
    monday.setDate(monday.getDate() - (dow - 1));
    const mKey = toDateKey(monday);

    if (mKey !== currentMondayKey) {
      if (currentMonday && currentDates.length > 0) {
        weeks.push({
          monday: currentMonday,
          dates: currentDates,
          patternWeek: getPatternWeek(currentMonday, patternStart),
        });
      }
      currentMonday = monday;
      currentMondayKey = mKey;
      currentDates = [];
    }

    currentDates.push(date);
  }

  if (currentMonday && currentDates.length > 0) {
    weeks.push({
      monday: currentMonday,
      dates: currentDates,
      patternWeek: getPatternWeek(currentMonday, patternStart),
    });
  }

  return weeks;
}

// --- Preference helpers ---

export function checkPrefViolation(provider: StaffMember, facilityId: string, dayName: string, facilities: Facility[]): boolean {
  const facName = facilities.find(f => f.id === facilityId)?.name ?? '';
  for (const pref of provider.preferences) {
    if (pref.category === 'Facility') {
      if (pref.type === 'Prefer') {
        if (pref.value !== facName && pref.days && pref.days.includes(dayName)) {
          return true;
        }
      } else if (pref.type === 'Avoid') {
        if (pref.value === facName && (!pref.days || pref.days.length === 0 || pref.days.includes(dayName))) {
          return true;
        }
      }
    }
  }
  return false;
}

export function getViolatedPreferences(provider: StaffMember, facilityId: string, dayName: string, facilities: Facility[]): string[] {
  const violations: string[] = [];
  const facName = facilities.find(f => f.id === facilityId)?.name ?? '';
  for (const pref of provider.preferences) {
    if (pref.category === 'Facility') {
      if (pref.type === 'Prefer') {
        if (pref.value !== facName && pref.days && pref.days.includes(dayName)) {
          violations.push(`Prefers ${pref.value} on ${dayName} (P${pref.priority ?? 3})`);
        }
      } else if (pref.type === 'Avoid') {
        if (pref.value === facName && (!pref.days || pref.days.length === 0 || pref.days.includes(dayName))) {
          violations.push(`Avoids ${facName} (P${pref.priority ?? 3})`);
        }
      }
    }
  }
  return violations;
}

// --- Pre-flight check ---

export function runPreflightCheck(
  year: number,
  month: number,
  staff: StaffMember[],
  facilities: Facility[],
  timeOff: TimeOffRequest[],
  patternStart: string,
): PreflightWarning[] {
  const warnings: PreflightWarning[] = [];
  const daysInMonth = getDaysInMonth(year, month);
  const totalSlotsNeeded = facilities.reduce((sum, f) => sum + f.weekdayMin, 0);

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();
    if (dow === 0) continue;

    const dayName = getDayName(date);
    const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    const available = staff.filter(s => {
      if (isOnPTO(s.id, date, timeOff)) return false;
      if (dow === 6) return s.schedule.saturdayAvailable;
      if (s.schedule.mode === 'specific') {
        const week = getPatternWeek(date, patternStart);
        const days = week === 1 ? s.schedule.week1Days : s.schedule.week2Days;
        return (days ?? []).includes(dayName);
      }
      if (s.schedule.excludedDays.includes(dayName)) return false;
      return true;
    });

    if (dow === 6) {
      const satSlots = facilities.reduce((sum, f) => f.saturdayOpen ? sum + f.saturdayCount : sum, 0);
      const satAvailable = available.filter(s => s.schedule.saturdayAvailable);
      if (satAvailable.length < satSlots) {
        warnings.push({ date: dateLabel, detail: `Only ${satAvailable.length} providers available for Saturday, need ${satSlots}.` });
      }
      continue;
    }

    if (available.length < totalSlotsNeeded) {
      warnings.push({ date: dateLabel, detail: `Only ${available.length} providers available, ${totalSlotsNeeded} slots needed.` });
    }

    for (const fac of facilities) {
      const requiredCaps = fac.requiredCapabilities.filter(rc => rc.days.includes(dayName));
      for (const rc of requiredCaps) {
        const qualified = available.filter(s => s.capabilities.includes(rc.capability) && s.facilities.includes(fac.id));
        if (qualified.length === 0) {
          warnings.push({ date: dateLabel, detail: `No ${rc.capability} provider available for ${fac.name}.` });
        }
      }
    }
  }

  return warnings;
}

// =============================================
// BRUTE FORCE SCHEDULER
//
// Enumerates all valid schedules and picks the highest-scoring one.
//
// Hard constraints (in priority order — relaxed from bottom up):
//   H1: Time off / PTO
//   H2: Facility restrictions (provider can only work at their facilities)
//   H3: Jenn cannot work Mondays (excluded days)
//   H4: Main needs 4 providers
//   H5: Main needs at least 1 PA for Procedures
//   H6: Scottsdale needs 1 provider
//   H7: Tracy at East on Wednesday (Neuro capability)
//   H8: Jenn max 3 days per week
//   H9: Pam max 4 days per week
//
// Soft constraints (scored):
//   S1-S3: P1 preferences (100 pts each)
//   S4: Tracy consecutive at Main (100 pts, togglable)
//   S5-S6: Pattern alternation (100 pts, togglable)
//   S7: Running balance (100 pts)
//   S8-S9: P2 preferences (50 pts each)
//   S10-S12: P4 nice-to-haves (10 pts each)
// =============================================

// --- Scoring weights ---
const W_P1 = 100;
const W_TRACY_CONSECUTIVE = 150; // Higher than P1 so Tracy's pairing can displace a single P1 preference
const W_P2 = 50;
const W_P4 = 10;
// Hard constraint violation penalties (higher H number = first to break = smaller penalty)
const W_HARD = [0, -90000, -80000, -70000, -60000, -50000, -40000, -30000, -20000, -10000];
// Index 0 unused; W_HARD[1] = H1 violation, W_HARD[9] = H9 violation

// --- Combination generator ---
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = combinations(arr.slice(i + 1), k - 1);
    for (const combo of rest) {
      result.push([arr[i], ...combo]);
    }
  }
  return result;
}

// --- Facility assignment enumeration ---
// Recursively assigns each working provider to a facility, pruning when facility max exceeded
interface ProviderOption {
  id: string;
  facilityIds: string[];
}

function enumerateFacilityAssignments(
  providers: ProviderOption[],
  facilityMaxes: Map<string, number>,
  facilityCounts: Map<string, number>,
  index: number,
  current: Map<string, string>,
  results: Map<string, string>[],
  maxResults: number,
): void {
  if (results.length >= maxResults) return;
  if (index === providers.length) {
    results.push(new Map(current));
    return;
  }
  const provider = providers[index];
  for (const fid of provider.facilityIds) {
    const count = facilityCounts.get(fid) ?? 0;
    const max = facilityMaxes.get(fid) ?? Infinity;
    if (count < max) {
      facilityCounts.set(fid, count + 1);
      current.set(provider.id, fid);
      enumerateFacilityAssignments(providers, facilityMaxes, facilityCounts, index + 1, current, results, maxResults);
      facilityCounts.set(fid, count);
      current.delete(provider.id);
    }
  }
}

// --- Score a single day's facility assignments ---
function scoreDayAssignment(
  assignments: Map<string, string>, // staffId → facilityId
  date: Date,
  staff: StaffMember[],
  facilities: Facility[],
): number {
  let score = 0;
  const dayName = getDayName(date);

  // Hard constraint checks (add penalties for violations)

  // H4: Main needs 4 providers (weekday)
  const mainFac = facilities.find(f => f.weekdayMin >= 4);
  if (mainFac) {
    const mainCount = [...assignments.values()].filter(fid => fid === mainFac.id).length;
    if (mainCount < mainFac.weekdayMin) {
      score += W_HARD[9] * (mainFac.weekdayMin - mainCount); // H9 penalty (was H4 in our list but it's the first to break)
    }
  }

  // H6: Scottsdale needs 1 provider
  for (const fac of facilities) {
    if (fac.weekdayMin > 0 && fac.weekdayMin < 4) { // non-Main facilities with minimums
      const count = [...assignments.values()].filter(fid => fid === fac.id).length;
      if (count < fac.weekdayMin) {
        score += W_HARD[8]; // H8 penalty (Scottsdale is second to break after Main)
      }
    }
  }

  // H5: Main needs at least 1 PA for Procedures
  if (mainFac) {
    const requiredCaps = mainFac.requiredCapabilities.filter(rc => rc.days.includes(dayName));
    for (const rc of requiredCaps) {
      const met = [...assignments.entries()].some(([sid, fid]) => {
        if (fid !== mainFac.id) return false;
        const provider = staff.find(s => s.id === sid);
        return provider?.capabilities.includes(rc.capability) ?? false;
      });
      if (!met) {
        score += W_HARD[7]; // H7 penalty
      }
    }
  }

  // H7: Capability requirements at all facilities (e.g., Tracy at East on Wed for Neuro)
  for (const fac of facilities) {
    const requiredCaps = fac.requiredCapabilities.filter(rc => rc.days.includes(dayName));
    for (const rc of requiredCaps) {
      const met = [...assignments.entries()].some(([sid, fid]) => {
        if (fid !== fac.id) return false;
        const provider = staff.find(s => s.id === sid);
        return provider?.capabilities.includes(rc.capability) ?? false;
      });
      if (!met && fac !== mainFac) { // Main already checked above
        score += W_HARD[6]; // H6 penalty
      }
    }
  }

  // Soft constraints: score preferences
  for (const [sid, fid] of assignments) {
    const provider = staff.find(s => s.id === sid);
    if (!provider) continue;
    const facName = facilities.find(f => f.id === fid)?.name ?? '';

    for (const pref of provider.preferences) {
      if (pref.category !== 'Facility') continue;
      const dayMatches = !pref.days || pref.days.length === 0 || pref.days.includes(dayName);
      if (!dayMatches) continue;

      const priority = pref.priority ?? 3;
      const weight = priority === 1 ? W_P1 : priority === 2 ? W_P2 : W_P4;

      if (pref.type === 'Prefer') {
        if (pref.value === facName) {
          score += weight; // Honored preference
        } else {
          score -= weight; // Violated preference
        }
      } else if (pref.type === 'Avoid') {
        if (pref.value === facName) {
          score -= weight; // At avoided facility
        }
      }
    }
  }

  // S10-S12: Clinic fill bonuses
  for (const fac of facilities) {
    if (fac.weekdayMin === 0 && fac.weekdayMax > 0) {
      const count = [...assignments.values()].filter(fid => fid === fac.id).length;
      if (count > 0) {
        score += W_P4; // S10/S11: clinic filled
      }
    }
  }

  return score;
}

// --- Score Tracy consecutive rule for a week ---
function scoreTracyConsecutive(
  weekAssignments: Map<string, Map<string, string>>, // dateKey → (staffId → facilityId)
  weekDates: Date[],
  tracyId: string | undefined,
  mainFacId: string | undefined,
): number {
  if (!tracyId || !mainFacId) return 0;

  // Count how many days Tracy is at Main
  let mainDays = 0;
  const tracyMainDays: string[] = []; // day names when Tracy is at Main
  for (const d of weekDates) {
    const dk = toDateKey(d);
    const dayAssign = weekAssignments.get(dk);
    if (dayAssign && dayAssign.get(tracyId) === mainFacId) {
      mainDays++;
      tracyMainDays.push(getDayName(d));
    }
  }

  if (mainDays === 0) return 0; // Not at Main at all — rule satisfied

  // Check if Main days come in valid consecutive pairs (Mon+Tue, Thu+Fri)
  const hasMonTue = tracyMainDays.includes('Mon') && tracyMainDays.includes('Tue');
  const hasThuFri = tracyMainDays.includes('Thu') && tracyMainDays.includes('Fri');
  const monAlone = tracyMainDays.includes('Mon') && !tracyMainDays.includes('Tue');
  const tueAlone = tracyMainDays.includes('Tue') && !tracyMainDays.includes('Mon');
  const thuAlone = tracyMainDays.includes('Thu') && !tracyMainDays.includes('Fri');
  const friAlone = tracyMainDays.includes('Fri') && !tracyMainDays.includes('Thu');
  const wedAtMain = tracyMainDays.includes('Wed'); // Wed should never be Main (Tracy at East)

  let pairScore = 0;
  if (hasMonTue) pairScore += W_TRACY_CONSECUTIVE;
  if (hasThuFri) pairScore += W_TRACY_CONSECUTIVE;

  // Penalize unpaired days
  const unpairedCount = (monAlone ? 1 : 0) + (tueAlone ? 1 : 0) + (thuAlone ? 1 : 0) + (friAlone ? 1 : 0) + (wedAtMain ? 1 : 0);
  pairScore -= unpairedCount * W_TRACY_CONSECUTIVE;

  return pairScore;
}

// --- Score clinic distribution fairness (S12) ---
function scoreClinicFairness(
  monthAssignments: Map<string, Map<string, string>>,
  staff: StaffMember[],
  facilities: Facility[],
): number {
  // Count how many times each flexible provider is at each clinic
  const clinicFacs = facilities.filter(f => f.weekdayMin === 0 && f.weekdayMax > 0);
  if (clinicFacs.length === 0) return 0;

  const flexProviders = staff.filter(s => s.facilities.length > 1); // can work at multiple facilities
  const clinicCounts = new Map<string, Map<string, number>>(); // staffId → (facId → count)

  for (const s of flexProviders) {
    const facCounts = new Map<string, number>();
    for (const f of clinicFacs) facCounts.set(f.id, 0);
    clinicCounts.set(s.id, facCounts);
  }

  for (const [, dayAssign] of monthAssignments) {
    for (const [sid, fid] of dayAssign) {
      const facCounts = clinicCounts.get(sid);
      if (facCounts && facCounts.has(fid)) {
        facCounts.set(fid, (facCounts.get(fid) ?? 0) + 1);
      }
    }
  }

  // Penalize imbalance: for each provider, variance across clinic counts
  let fairnessScore = 0;
  for (const [, facCounts] of clinicCounts) {
    const counts = [...facCounts.values()];
    if (counts.length < 2) continue;
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    // Reward balance: penalty for large spread
    fairnessScore -= (max - min) * W_P4;
  }

  return fairnessScore;
}

// =============================================
// MAIN SCHEDULE GENERATOR
// =============================================

export function generateSchedule(
  year: number,
  month: number,
  staff: StaffMember[],
  facilities: Facility[],
  timeOff: TimeOffRequest[],
  patternStart: string,
  pinnedAssignments: Map<string, Assignment[]>,
  ruleToggles: Record<string, boolean>,
  splitWeekCarryover?: Map<string, number>,
): DayData[] {
  const calendarDays = buildCalendarDays(year, month);
  const weeks = getWorkWeeks(year, month, patternStart);
  const daysInMonth = getDaysInMonth(year, month);
  const tracyConsecutiveEnabled = ruleToggles['tracy_consecutive'] !== false;
  const carryoverMap = splitWeekCarryover ?? new Map<string, number>();

  // Find key providers and facilities by their properties
  const tracyId = staff.find(s => s.capabilities.includes('Neuro'))?.id;
  const mainFac = facilities.find(f => f.weekdayMin >= 4);
  const mainFacId = mainFac?.id;

  // Build dateKey → Date lookup
  const dateMap = new Map<string, Date>();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    dateMap.set(toDateKey(date), date);
  }

  // Solution: dateKey → Map<staffId, facilityId>
  const monthSolution = new Map<string, Map<string, string>>();

  // Process each work week
  let isFirstWeek = true;
  for (const week of weeks) {
    const weekKeys = week.dates.map(d => toDateKey(d));

    // 1. Determine base availability per provider per day
    const baseAvail = new Map<string, string[]>();
    for (const s of staff) {
      const avail: string[] = [];
      for (const d of week.dates) {
        const dk = toDateKey(d);
        const dayName = getDayName(d);
        if (isOnPTO(s.id, d, timeOff)) continue;
        if (s.schedule.excludedDays.includes(dayName)) continue;
        if (s.schedule.mode === 'specific') {
          const days = week.patternWeek === 1 ? s.schedule.week1Days : s.schedule.week2Days;
          if (!(days ?? []).includes(dayName)) continue;
        }
        avail.push(dk);
      }
      baseAvail.set(s.id, avail);
    }

    // 2. Identify part-timers and full-timers
    const partTimers = staff.filter(s => s.schedule.mode === 'daysPerWeek');
    const fullTimerIds = new Set(staff.filter(s => s.schedule.mode !== 'daysPerWeek').map(s => s.id));

    // Count pinned days per provider in this week (Bug #2 fix)
    const weekPinnedDays = new Map<string, number>();
    const weekPinnedDateKeys = new Map<string, Set<string>>();
    for (const dk of weekKeys) {
      const pinned = pinnedAssignments.get(dk) ?? [];
      for (const p of pinned) {
        if (p.facilityId !== '__pto__' && p.facilityId !== '__off__') {
          weekPinnedDays.set(p.staffId, (weekPinnedDays.get(p.staffId) ?? 0) + 1);
          if (!weekPinnedDateKeys.has(p.staffId)) weekPinnedDateKeys.set(p.staffId, new Set());
          weekPinnedDateKeys.get(p.staffId)!.add(dk);
        }
      }
    }

    // 3. Compute part-timer targets with pin subtraction, split week, and flex options
    const perProviderOptions: { id: string; options: string[][] }[] = [];

    for (const s of partTimers) {
      const patternTarget = week.patternWeek === 1
        ? (s.schedule.week1Count ?? 0)
        : (s.schedule.week2Count ?? 0);

      // Split week adjustment: subtract days already worked in previous month
      const carryover = isFirstWeek ? (carryoverMap.get(s.id) ?? 0) : 0;
      const adjustedBase = Math.max(0, patternTarget - carryover);

      // Subtract pinned days from target
      const pinnedCount = weekPinnedDays.get(s.id) ?? 0;
      const comboTarget = Math.max(0, adjustedBase - pinnedCount);

      // Remove pinned days from available days
      const avail = baseAvail.get(s.id)!;
      const pinnedKeys = weekPinnedDateKeys.get(s.id) ?? new Set();
      const unpinnedAvail = avail.filter(dk => !pinnedKeys.has(dk));

      // Generate combos at exact target (no flex — removed, needs redesign)
      const normalTarget = Math.min(comboTarget, unpinnedAvail.length);
      const opts = combinations(unpinnedAvail, normalTarget);
      if (opts.length === 0) {
        perProviderOptions.push({ id: s.id, options: [[]] });
      } else {
        perProviderOptions.push({ id: s.id, options: opts });
      }
    }

    // Cartesian product of all part-timer day-selection options
    interface DaySelectionCombo {
      selections: Map<string, Set<string>>;
    }

    function cartesianProduct(options: { id: string; options: string[][] }[]): DaySelectionCombo[] {
      if (options.length === 0) return [{ selections: new Map() }];
      const [first, ...rest] = options;
      const restCombos = cartesianProduct(rest);
      const results: DaySelectionCombo[] = [];
      for (const opt of first.options) {
        for (const rc of restCombos) {
          const sel = new Map(rc.selections);
          sel.set(first.id, new Set(opt));
          results.push({ selections: sel });
        }
      }
      return results;
    }

    const allDaySelections = cartesianProduct(perProviderOptions);

    // 4. For each day-selection combo, find best facility assignments and score
    let bestWeekScore = -Infinity;
    let bestWeekSolution = new Map<string, Map<string, string>>();

    for (const daySelection of allDaySelections) {
      const weekAssignments = new Map<string, Map<string, string>>();
      let weekScore = 0;

      for (const dk of weekKeys) {
        const date = dateMap.get(dk)!;
        const pinned = pinnedAssignments.get(dk) ?? [];
        const pinnedStaffIds = new Set(pinned.map(p => p.staffId));

        // Determine who's working today
        const workingProviders: ProviderOption[] = [];
        const facilityCounts = new Map<string, number>();
        for (const fac of facilities) facilityCounts.set(fac.id, 0);
        const facilityMaxes = new Map<string, number>();
        for (const fac of facilities) facilityMaxes.set(fac.id, fac.weekdayMax);

        // Handle pinned assignments first — lock them in
        const pinnedMap = new Map<string, string>();
        for (const p of pinned) {
          if (p.facilityId !== '__pto__' && p.facilityId !== '__off__') {
            pinnedMap.set(p.staffId, p.facilityId);
            const count = facilityCounts.get(p.facilityId) ?? 0;
            facilityCounts.set(p.facilityId, count + 1);
          }
        }

        // Build list of non-pinned working providers for today
        for (const s of staff) {
          if (pinnedStaffIds.has(s.id)) continue; // already pinned

          // Is this provider working today?
          let working = false;
          if (fullTimerIds.has(s.id)) {
            working = (baseAvail.get(s.id) ?? []).includes(dk);
          } else {
            // Part-timer: check day selection
            working = daySelection.selections.get(s.id)?.has(dk) ?? false;
          }

          if (!working) continue;

          // H2: Facility restrictions — only include facilities this provider can work at
          const providerFacilities = s.facilities.filter(fid => facilities.some(f => f.id === fid));
          if (providerFacilities.length === 0) continue;

          workingProviders.push({ id: s.id, facilityIds: providerFacilities });
        }

        // Enumerate all valid facility assignments for today
        const dayResults: Map<string, string>[] = [];
        enumerateFacilityAssignments(
          workingProviders,
          facilityMaxes,
          new Map(facilityCounts), // clone so enumeration doesn't mutate
          0,
          new Map(pinnedMap), // start with pinned
          dayResults,
          5000, // cap to prevent runaway
        );

        if (dayResults.length === 0) {
          // No valid assignment possible — create best-effort with just pinned + whatever we can
          // Put each working provider at their first available facility
          const fallback = new Map<string, string>(pinnedMap);
          const fallbackCounts = new Map(facilityCounts);
          for (const wp of workingProviders) {
            if (fallback.has(wp.id)) continue;
            // Try to find a facility that isn't full
            let assigned = false;
            for (const fid of wp.facilityIds) {
              const count = fallbackCounts.get(fid) ?? 0;
              const max = facilityMaxes.get(fid) ?? 0;
              if (count < max) {
                fallback.set(wp.id, fid);
                fallbackCounts.set(fid, count + 1);
                assigned = true;
                break;
              }
            }
            if (!assigned && wp.facilityIds.length > 0) {
              // All facilities full — assign to first one anyway (will get penalty)
              fallback.set(wp.id, wp.facilityIds[0]);
            }
          }
          weekAssignments.set(dk, fallback);
          weekScore += scoreDayAssignment(fallback, date, staff, facilities);
          continue;
        }

        // Score each valid assignment and pick the best
        let bestDayScore = -Infinity;
        let bestDayAssign = dayResults[0];
        for (const assign of dayResults) {
          const s = scoreDayAssignment(assign, date, staff, facilities);
          if (s > bestDayScore) {
            bestDayScore = s;
            bestDayAssign = assign;
          }
        }

        weekAssignments.set(dk, bestDayAssign);
        weekScore += bestDayScore;
      }

      // Cross-day scoring: Tracy consecutive rule (S4)
      if (tracyConsecutiveEnabled) {
        weekScore += scoreTracyConsecutive(weekAssignments, week.dates, tracyId, mainFacId);
      }

      // S12: Clinic fairness (include previous weeks + this week candidate)
      const partialMonth = new Map(monthSolution);
      for (const [dk, assign] of weekAssignments) {
        partialMonth.set(dk, assign);
      }
      weekScore += scoreClinicFairness(partialMonth, staff, facilities);

      if (weekScore > bestWeekScore) {
        bestWeekScore = weekScore;
        bestWeekSolution = weekAssignments;
      }
    }

    // Store this week's solution
    for (const [dk, dayAssign] of bestWeekSolution) {
      monthSolution.set(dk, dayAssign);
    }

    isFirstWeek = false;
  }

  // ==============================
  // BUILD CALENDAR OUTPUT
  // ==============================
  // Initialize Saturday counts from previous months for fair rotation
  const saturdayCounts = new Map<string, number>();
  staff.forEach(s => saturdayCounts.set(s.id, 0));
  // Look back up to 3 months to seed Saturday fairness
  for (let lookback = 1; lookback <= 3; lookback++) {
    const prevM = month - lookback;
    const prevY = prevM < 0 ? year - 1 : year;
    const prevMonth = ((prevM % 12) + 12) % 12;
    const prevKey = `scheduler_schedule_${prevY}-${String(prevMonth + 1).padStart(2, '0')}`;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(prevKey) : null;
      if (raw) {
        const prev = JSON.parse(raw) as { state: string; days: { dateISO: string; assignments: { staffId: string; facilityId: string }[] }[] };
        if (prev.state === 'generated') {
          for (const sd of prev.days) {
            const d = new Date(sd.dateISO + 'T00:00:00');
            if (d.getDay() === 6) { // Saturday
              for (const a of sd.assignments) {
                if (a.facilityId !== '__pto__' && a.facilityId !== '__off__') {
                  saturdayCounts.set(a.staffId, (saturdayCounts.get(a.staffId) ?? 0) + 1);
                }
              }
            }
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  for (const day of calendarDays) {
    if (!day.isCurrentMonth) continue;
    const dk = toDateKey(day.date);
    const dayName = getDayName(day.date);
    const dow = day.date.getDay();

    const pinned = pinnedAssignments.get(dk) ?? [];
    const assignedStaffIds = new Set<string>();

    // --- Sunday ---
    if (day.isSunday) {
      day.assignments = pinned.map(a => ({ ...a }));
      pinned.forEach(p => assignedStaffIds.add(p.staffId));
      const sundayFacs = facilities.filter(f => f.sundayOpen && f.sundayCount > 0);
      for (const fac of sundayFacs) {
        const available = staff.filter(s =>
          !assignedStaffIds.has(s.id) && s.schedule.saturdayAvailable &&
          s.facilities.includes(fac.id) && !isOnPTO(s.id, day.date, timeOff)
        );
        for (let n = 0; n < fac.sundayCount && available.length > 0; n++) {
          const provider = available.shift()!;
          day.assignments.push({ staffId: provider.id, facilityId: fac.id, pinned: false, prefViolation: false });
          assignedStaffIds.add(provider.id);
        }
      }
      for (const s of staff) {
        if (!assignedStaffIds.has(s.id) && isOnPTO(s.id, day.date, timeOff)) {
          day.assignments.push({ staffId: s.id, facilityId: '__pto__', pinned: false, prefViolation: false });
        }
      }
      continue;
    }

    // --- Saturday ---
    if (day.isWeekend) {
      day.assignments = pinned.map(a => ({ ...a }));
      pinned.forEach(p => assignedStaffIds.add(p.staffId));
      const satFacs = facilities.filter(f => f.saturdayOpen && f.saturdayCount > 0);
      const available = staff.filter(s =>
        !assignedStaffIds.has(s.id) && s.schedule.saturdayAvailable && !isOnPTO(s.id, day.date, timeOff)
      );
      // Sort by fewest Saturdays worked; use day-of-month as tiebreaker for variety
      const dayTie = day.dayOfMonth;
      available.sort((a, b) => {
        const diff = (saturdayCounts.get(a.id) ?? 0) - (saturdayCounts.get(b.id) ?? 0);
        if (diff !== 0) return diff;
        // Rotate tiebreaker based on which Saturday of the month this is
        const aIdx = staff.indexOf(a);
        const bIdx = staff.indexOf(b);
        return ((aIdx + dayTie) % staff.length) - ((bIdx + dayTie) % staff.length);
      });

      for (const fac of satFacs) {
        const requiredCaps = fac.requiredCapabilities.filter(rc => rc.days.includes('Sat'));
        for (const rc of requiredCaps) {
          const alreadyMet = day.assignments.some(a =>
            a.facilityId === fac.id && staff.find(s => s.id === a.staffId)?.capabilities.includes(rc.capability)
          );
          if (!alreadyMet) {
            const idx = available.findIndex(s =>
              s.capabilities.includes(rc.capability) && s.facilities.includes(fac.id) && !assignedStaffIds.has(s.id)
            );
            if (idx >= 0) {
              const provider = available[idx];
              day.assignments.push({ staffId: provider.id, facilityId: fac.id, pinned: false, prefViolation: false });
              assignedStaffIds.add(provider.id);
              saturdayCounts.set(provider.id, (saturdayCounts.get(provider.id) ?? 0) + 1);
              available.splice(idx, 1);
            }
          }
        }
        const currentCount = day.assignments.filter(a => a.facilityId === fac.id).length;
        for (let n = currentCount; n < fac.saturdayCount; n++) {
          const provider = available.find(s => s.facilities.includes(fac.id) && !assignedStaffIds.has(s.id));
          if (provider) {
            day.assignments.push({ staffId: provider.id, facilityId: fac.id, pinned: false, prefViolation: false });
            assignedStaffIds.add(provider.id);
            saturdayCounts.set(provider.id, (saturdayCounts.get(provider.id) ?? 0) + 1);
            available.splice(available.indexOf(provider), 1);
          }
        }
      }
      for (const s of staff) {
        if (!assignedStaffIds.has(s.id) && isOnPTO(s.id, day.date, timeOff)) {
          day.assignments.push({ staffId: s.id, facilityId: '__pto__', pinned: false, prefViolation: false });
        }
      }
      continue;
    }

    // --- Weekday: read from brute force solution ---
    day.assignments = [];
    const solution = monthSolution.get(dk);

    // Pinned first
    for (const p of pinned) {
      const provider = staff.find(s => s.id === p.staffId);
      if (provider && p.facilityId !== '__pto__' && p.facilityId !== '__off__') {
        day.assignments.push({ ...p, prefViolation: checkPrefViolation(provider, p.facilityId, dayName, facilities) });
      } else {
        day.assignments.push({ ...p });
      }
      assignedStaffIds.add(p.staffId);
    }

    // Solution assignments
    if (solution) {
      for (const s of staff) {
        if (assignedStaffIds.has(s.id)) continue;
        const fid = solution.get(s.id);
        if (!fid) {
          // Provider not in solution — check if on PTO
          if (isOnPTO(s.id, day.date, timeOff)) {
            day.assignments.push({ staffId: s.id, facilityId: '__pto__', pinned: false, prefViolation: false });
          } else {
            // Off day (part-timer not scheduled)
            day.assignments.push({ staffId: s.id, facilityId: '__off__', pinned: false, prefViolation: false });
          }
        } else {
          day.assignments.push({
            staffId: s.id, facilityId: fid, pinned: false,
            prefViolation: checkPrefViolation(s, fid, dayName, facilities),
          });
        }
      }
    } else {
      // No solution for this day — show everyone as off/PTO
      for (const s of staff) {
        if (assignedStaffIds.has(s.id)) continue;
        if (isOnPTO(s.id, day.date, timeOff)) {
          day.assignments.push({ staffId: s.id, facilityId: '__pto__', pinned: false, prefViolation: false });
        } else {
          day.assignments.push({ staffId: s.id, facilityId: '__off__', pinned: false, prefViolation: false });
        }
      }
    }

    // Coverage check
    const issues: string[] = [];
    for (const fac of facilities) {
      const count = day.assignments.filter(a => a.facilityId === fac.id).length;
      if (count < fac.weekdayMin) {
        issues.push(`${fac.name}: need ${fac.weekdayMin}, have ${count}`);
      }
      for (const rc of fac.requiredCapabilities.filter(r => r.days.includes(dayName))) {
        const met = day.assignments.some(a =>
          a.facilityId === fac.id && staff.find(ss => ss.id === a.staffId)?.capabilities.includes(rc.capability)
        );
        if (!met) issues.push(`${fac.name}: no ${rc.capability} provider`);
      }
    }
    if (issues.length > 0) day.coverageIssue = issues.join('; ');
  }

  return calendarDays;
}
