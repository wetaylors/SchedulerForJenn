export interface Preference {
  id: string;
  category: 'Day' | 'Facility';
  type: 'Prefer' | 'Avoid';
  value: string;
  days?: string[]; // for Facility: which days this preference applies (empty = not set)
  priority?: 1 | 2 | 3 | 4 | 5;
}

export interface SchedulePattern {
  mode: 'specific' | 'daysPerWeek';
  // "specific" mode: which days are checked
  week1Days?: string[]; // e.g. ['Mon', 'Wed', 'Fri']
  week2Days?: string[]; // e.g. ['Tue', 'Wed']
  // "daysPerWeek" mode: just a count
  week1Count?: number;
  week2Count?: number;
  // Excluded days (never schedule)
  excludedDays: string[];
  // Saturday availability
  saturdayAvailable: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  type: 'PA' | 'NP';
  facilities: string[]; // facility IDs
  capabilities: string[];
  schedule: SchedulePattern;
  preferences: Preference[];
  notes: string;
}

export interface FacilityCapabilityRequirement {
  capability: string;
  days: string[]; // e.g. ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
}

export interface Facility {
  id: string;
  name: string;
  weekdayMin: number;
  weekdayMax: number;
  saturdayOpen: boolean;
  saturdayCount: number;
  sundayOpen: boolean;
  sundayCount: number;
  requiredCapabilities: FacilityCapabilityRequirement[];
  notes: string;
}

export interface TimeOffRequest {
  id: string;
  staffId: string;
  startDate: string; // ISO date string
  endDate: string;
  notes: string;
}

export interface AppSettings {
  patternStartDate: string; // ISO date — anchors Week 1 for everyone
}
