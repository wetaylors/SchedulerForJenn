import type { StaffMember, Facility, TimeOffRequest, AppSettings } from '../types';

const KEYS = {
  staff: 'scheduler_staff',
  facilities: 'scheduler_facilities',
  timeOff: 'scheduler_timeoff',
  settings: 'scheduler_settings',
  seeded: 'scheduler_seeded',
};

function load<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Staff
export function getStaff(): StaffMember[] {
  return load<StaffMember[]>(KEYS.staff, []);
}
export function saveStaff(staff: StaffMember[]): void {
  save(KEYS.staff, staff);
}

// Facilities
export function getFacilities(): Facility[] {
  return load<Facility[]>(KEYS.facilities, []);
}
export function saveFacilities(facilities: Facility[]): void {
  save(KEYS.facilities, facilities);
}

// Time Off
export function getTimeOff(): TimeOffRequest[] {
  return load<TimeOffRequest[]>(KEYS.timeOff, []);
}
export function saveTimeOff(timeOff: TimeOffRequest[]): void {
  save(KEYS.timeOff, timeOff);
}

// Settings
export function getSettings(): AppSettings {
  return load<AppSettings>(KEYS.settings, { patternStartDate: '' });
}
export function saveSettings(settings: AppSettings): void {
  save(KEYS.settings, settings);
}

// Schedule (per-month)
export interface SavedScheduleDay {
  dateISO: string;
  assignments: { staffId: string; facilityId: string; pinned: boolean; prefViolation: boolean }[];
  coverageIssue: string | null;
  coverageAccepted: boolean;
}

export interface SavedSchedule {
  state: 'blank' | 'generated';
  days: SavedScheduleDay[];
}

function scheduleKey(year: number, month: number): string {
  return `scheduler_schedule_${year}-${String(month + 1).padStart(2, '0')}`;
}

export function getSchedule(year: number, month: number): SavedSchedule | null {
  return load<SavedSchedule | null>(scheduleKey(year, month), null);
}

export function saveSchedule(year: number, month: number, schedule: SavedSchedule): void {
  save(scheduleKey(year, month), schedule);
}

// Scheduling rule toggles
const RULES_STORAGE_KEY = 'scheduler_rules';

export function getRuleToggles(): Record<string, boolean> {
  const raw = localStorage.getItem(RULES_STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

// All unique capabilities across all facilities
export function getAllCapabilities(): string[] {
  const facilities = getFacilities();
  const caps = new Set<string>();
  facilities.forEach(f => f.requiredCapabilities.forEach(rc => caps.add(rc.capability)));
  return Array.from(caps).sort();
}

// Seed check
export function hasSeeded(): boolean {
  return localStorage.getItem(KEYS.seeded) === 'true';
}
export function markSeeded(): void {
  localStorage.setItem(KEYS.seeded, 'true');
}
