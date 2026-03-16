import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { StaffMember, Facility, TimeOffRequest, AppSettings } from '../types';

// ---- Types ----

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

// ---- In-memory cache ----

const _cache = {
  staff: [] as StaffMember[],
  facilities: [] as Facility[],
  timeOff: [] as TimeOffRequest[],
  settings: { patternStartDate: '' } as AppSettings,
  rules: {} as Record<string, boolean>,
  seeded: false,
  schedules: new Map<string, SavedSchedule | null>(),
};

// ---- Listeners (for real-time React updates) ----

type Listener = () => void;
const _listeners = new Set<Listener>();

export function subscribeToStore(fn: Listener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function _notify() {
  _listeners.forEach(fn => fn());
}

// ---- Init (call once at app startup) ----

export function initStore(): Promise<void> {
  return new Promise((resolve, reject) => {
    const initialized = new Set<string>();
    const keys = ['staff', 'facilities', 'timeOff', 'settings', 'rules', 'seeded'];

    const checkDone = (key: string) => {
      initialized.add(key);
      if (keys.every(k => initialized.has(k))) resolve();
    };

    onSnapshot(doc(db, 'config', 'staff'), snap => {
      _cache.staff = (snap.data()?.data as StaffMember[]) ?? [];
      _notify();
      checkDone('staff');
    }, reject);

    onSnapshot(doc(db, 'config', 'facilities'), snap => {
      _cache.facilities = (snap.data()?.data as Facility[]) ?? [];
      _notify();
      checkDone('facilities');
    }, reject);

    onSnapshot(doc(db, 'config', 'timeOff'), snap => {
      _cache.timeOff = (snap.data()?.data as TimeOffRequest[]) ?? [];
      _notify();
      checkDone('timeOff');
    }, reject);

    onSnapshot(doc(db, 'config', 'settings'), snap => {
      _cache.settings = (snap.data() as AppSettings | undefined) ?? { patternStartDate: '' };
      _notify();
      checkDone('settings');
    }, reject);

    onSnapshot(doc(db, 'config', 'rules'), snap => {
      _cache.rules = (snap.data()?.data as Record<string, boolean>) ?? {};
      _notify();
      checkDone('rules');
    }, reject);

    onSnapshot(doc(db, 'config', 'seeded'), snap => {
      _cache.seeded = snap.data()?.value === true;
      checkDone('seeded');
    }, reject);
  });
}

// ---- Staff ----

export function getStaff(): StaffMember[] { return _cache.staff; }

export function saveStaff(staff: StaffMember[]): void {
  _cache.staff = staff;
  _notify();
  setDoc(doc(db, 'config', 'staff'), { data: staff }).catch(console.error);
}

// ---- Facilities ----

export function getFacilities(): Facility[] { return _cache.facilities; }

export function saveFacilities(facilities: Facility[]): void {
  _cache.facilities = facilities;
  _notify();
  setDoc(doc(db, 'config', 'facilities'), { data: facilities }).catch(console.error);
}

// ---- Time Off ----

export function getTimeOff(): TimeOffRequest[] { return _cache.timeOff; }

export function saveTimeOff(timeOff: TimeOffRequest[]): void {
  _cache.timeOff = timeOff;
  _notify();
  setDoc(doc(db, 'config', 'timeOff'), { data: timeOff }).catch(console.error);
}

// ---- Settings ----

export function getSettings(): AppSettings { return _cache.settings; }

export function saveSettings(settings: AppSettings): void {
  _cache.settings = settings;
  _notify();
  setDoc(doc(db, 'config', 'settings'), settings).catch(console.error);
}

// ---- Rule Toggles ----

export function getRuleToggles(): Record<string, boolean> { return _cache.rules; }

export function saveRuleToggles(rules: Record<string, boolean>): void {
  _cache.rules = rules;
  _notify();
  setDoc(doc(db, 'config', 'rules'), { data: rules }).catch(console.error);
}

// ---- Schedule (per-month) ----

function scheduleKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function getSchedule(year: number, month: number): SavedSchedule | null {
  const key = scheduleKey(year, month);
  if (!_cache.schedules.has(key)) return null;
  return _cache.schedules.get(key) ?? null;
}

export async function loadSchedule(year: number, month: number): Promise<SavedSchedule | null> {
  const key = scheduleKey(year, month);
  const snap = await getDoc(doc(db, 'schedules', key));
  const data = snap.exists() ? (snap.data() as SavedSchedule) : null;
  _cache.schedules.set(key, data);
  return data;
}

export function saveSchedule(year: number, month: number, schedule: SavedSchedule): void {
  const key = scheduleKey(year, month);
  _cache.schedules.set(key, schedule);
  setDoc(doc(db, 'schedules', key), schedule).catch(console.error);
}

// ---- Seeded ----

export function hasSeeded(): boolean { return _cache.seeded; }

export function markSeeded(): void {
  _cache.seeded = true;
  setDoc(doc(db, 'config', 'seeded'), { value: true }).catch(console.error);
}

// ---- Capabilities ----

export function getAllCapabilities(): string[] {
  const caps = new Set<string>();
  _cache.facilities.forEach(f => f.requiredCapabilities.forEach(rc => caps.add(rc.capability)));
  return Array.from(caps).sort();
}
