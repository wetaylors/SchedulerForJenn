# Scheduler For Jenn — Design Decisions

This document captures all UI and design decisions made during development.
It's a human-readable reference — not used by the app.

---

## Staff Entry Fields
- Name, Type (PA/NP), Facilities (checkboxes), Capabilities (checkboxes), Schedule, Preferences, Notes (free text)

## Facility Entry Fields
- Name (user-defined), Weekday provider count (min/max), Saturday (open/closed + count), Sunday (open/closed + count), Required capabilities (per-day grid), Notes (free text)
- Saturday and Sunday are separate checkboxes — Jennifer's team only needs Saturday coverage currently

## Schedule (Availability — Hard Constraints)
- 2-week repeating pattern with two modes (radio toggle):
  - **Specific days**: Week 1 and Week 2 each have Mon-Fri checkboxes (for providers with fixed days)
  - **Days per week**: Just a number for each week (e.g., 2 days / 3 days) — scheduler picks best days for coverage
- Pattern start date is a **global setting** (Settings page), not per-provider — anchors which week is "Week 1" for everyone
- Separate "Available for Saturday shifts" checkbox — not part of the weekly pattern
- Saturday shifts are rotated evenly among all providers marked available
- Half the staff are part-time with various 2-week patterns
- Staff table shorthand: `MWF / TW` (specific), `2d / 3d` (flexible), `M-F / M-F` (full-time)
- Scheduler must obey these — never violated

## Preferences (Soft Constraints)
- Generic system: **Category** + **Type** + **Value** + **Days** (checkboxes, Facility only) + **Priority (1-5)**
- Categories: Day, Facility
- Type: Prefer or Avoid (every category supports both)
- Value: context-dependent (day names, facility names, numbers)
- Examples: Day/Avoid/Monday/4, Day/Prefer/Friday/3, Facility/Prefer/Eastside/1
- Priority is 1-5 (1 = Highest, 5 = Lowest) — UI labels: 1-Highest, 2-High, 3-Medium, 4-Low, 5-Lowest
- Priority is **per-preference, not per-provider** — Jennifer ranks individual preferences globally across all staff
- When two preferences conflict, scheduler honors the lower number (higher priority); ties broken by best overall coverage
- Conflicting preferences that lose get the red left border on calendar
- No free text — only structured dropdowns
- New categories can be added later without UI redesign
- Add via "+ Add Preference" button (adds a new row), Save to confirm
- Scheduler tries to honor but can break when coverage requires it
- Violations shown with red left border on calendar (more visible than dot)

## Capabilities
- Fully configurable and per-day — no hard-coded capability names
- Jennifer defines capability names on the Facilities page (e.g., "Procedures", "Neuro", "Telehealth")
- Defined capabilities appear as checkboxes on Staff edit (to assign to providers)
- Facilities require capabilities **on specific days of the week** (not blanket)
  - Each required capability gets Mon-Sun checkboxes on the facility edit
  - Example: Main requires Procedures Mon-Fri (not Sat), East Clinic requires Neuro on Wed
- Scheduler ensures at least one assigned provider has the required capability on that day
  - This is one of the already-assigned providers, not an additional slot
- Built generic — currently Main (Procedures) and East Clinic (Neuro on Wed) use it

## Dashboard
- Read-only summary of all inputs before generating schedule
- Staff table: name, type (PA/NP), allowed facilities, capabilities, schedule, preferences
- Facility table: daily coverage needs, weekend status, required capabilities
- Time-off requests for the schedule period
- Scheduling rules summary (derived from data, not manually entered)
- "Go to Schedule" button at bottom
- Shows a "Get started" nudge if no data entered yet

## Schedule Generation Workflow
- Month picker on Schedule page — select month to generate (one month at a time)
- Blank calendar opens — Jennifer can manually add & pin assignments before generating (pre-load special cases)
- Same editing tools available on blank calendar as post-generate (+ Add, pin, etc.)
- When ready, hits "Generate" — pre-flight check runs, scanning inputs for the selected month
- Warning dialog if issues found (e.g., "May 14: Only 4 providers available, 7 slots needed")
- Two buttons: "Generate Anyway" (best-effort) or "Go Back to Fix"
- Even with warnings, scheduler does its best with available resources
- Jennifer typically starts scheduling ~1 week before the new month

## Visual Language on Calendar
- **Red left border** = preference violation (soft constraint broken)
- **Orange border + pin icon** = pinned assignment
- **Flashing red/white pulse** = coverage requirement not met (hard failure)
  - CSS animation: red background fading to white and back, repeating
  - Keeps flashing until Jennifer acknowledges/accepts the non-conformance
  - Click flashing cell to see details (e.g., "Need 4 providers, only 3 assigned") + "Accept" to stop flashing
- **PTO** shown in red
- **Scheduled Off** shown in gray
- **Facility colors** — each facility gets a unique color (blue, pink, green, yellow, etc.)
- **Legend** at bottom of calendar explains all visual indicators

## Interactive Schedule Editing (Pin & Regenerate)
- Jennifer generates a schedule, reviews it, then edits directly on the calendar
- She can "pin" assignments (e.g., force Austin at Main on May 18)
- Hit "Regenerate" — scheduler treats pinned assignments as fixed, reschedules the rest
- Replaces the need for pre-configured day-specific overrides
- Iterative: pin a few things, regenerate, pin more until satisfied
- UI: click a cell to edit, pinned items shown with orange border + pin icon
- Pin bar at top summarizes all pinned assignments
- **Click interaction: popup with actions**
  - Click an assignment -> popup appears with:
    1. Change facility (dropdown of facilities)
    2. Remove from this day
    3. Pin this assignment (on unpinned items) — locks it during regenerate
    4. Unpin (on pinned items) — lets scheduler decide again
  - "+ Add" button at bottom of each day cell -> popup with provider dropdown + facility dropdown + "Add & Pin"
  - All manual changes auto-pin (orange border)
  - Changes are pinned until explicitly unpinned
- **Clear button** — resets the month's schedule to blank (with confirmation dialog)

## Provider Filter Bar (on Schedule page)
- Row of toggle chips above the calendar, one per provider name
- Click to toggle on/off — active chips are dark, off chips are light gray
- "Show All" / "Show None" buttons
- Hidden providers' assignments turn gray (not removed — just visually muted)
- Purely a viewing tool — doesn't affect the data, resets on page reload

## Schedule Persistence
- Each month's schedule saved to localStorage keyed by `schedule_YYYY-MM`
- Auto-saves on every action: generate, regenerate, pin, unpin, add, remove, change facility, accept coverage
- Survives browser close — come back and it's exactly as left
- Navigate between months — each month has its own saved state
- Can view previous months' schedules

## Settings Page
- **2-week pattern start date**: Anchors which week is "Week 1" for all providers
- **Scheduling rules toggles**: 4 hard-coded rules with on/off switches
  - Tracy: Consecutive days at Main (2-day blocks)
  - Jenn: 2/3 pattern alternation
  - Pam: 3/4 pattern alternation
  - Scottsdale: Fill before Main reaches full count
  - Each toggle shows a yellow warning when disabled explaining the consequence

## Everything is Configurable by Jennifer
- Staff, facilities, time-off all entered/edited by Jennifer
- Facility names are user-defined (not fixed A/B/C/D)
- Facilities can be added/removed as needed
- No separate "setup wizard" — same screens for first-time entry and later edits
- Capability names defined by Jennifer on Facilities page
- Preference dropdowns show ALL facilities and ALL days (not filtered — Mike found filtered version confusing)

## TigerConnect Integration (planned)
- Jennifer currently forced to use TigerConnect Physician Scheduling
- She will use our tool to generate schedules, then enter into TigerConnect
- TigerConnect supports Excel import/export
- Plan: add "Export to Excel" button that outputs schedule in TigerConnect's format
- Waiting on Jennifer to provide an Excel export from TigerConnect so we can match the format

## Hard-coded Rules (documented via Notes fields in UI)
- **Tracy**: "Must work consecutive days at Main (minimum 2-day blocks). Hard-coded in scheduler."
- **Jenn**: "2/3 pattern: can do back-to-back same weeks (e.g., 3+3 or 2+2) but must alternate after. Hard-coded in scheduler."
- **Pam**: "3/4 pattern: can do back-to-back same weeks (e.g., 4+4 or 3+3) but must alternate after. Hard-coded in scheduler."
- **Scottsdale Clinic**: "Coverage priority — fill Scottsdale (1) before Main reaches full count (4). Hard-coded in scheduler."

## Scheduler Priority Stack (highest to lowest)
1. **Never break**: Time off, facility restrictions (provider not checked for that facility), capability requirements (must have qualified provider on required days)
2. **Really try hard**: Daily coverage minimums (right number of providers at each facility)
3. **Try to honor**: Week-to-week pattern split (2/3, 4/2, etc.)
4. **Balance over time**: If someone worked extra due to shortage, lighten future weeks to compensate
5. **Nice to have**: Preferences — honored in priority order (1 first, then 2, etc.)

## Pattern Balancing (part-time providers)
- Each part-timer has a 2-week pattern (e.g., 2/3, 4/2) — what matters is **total days per cycle**
- 2/3 = 5 days per 2-week cycle, 4/2 = 6 days per cycle, etc.
- If a provider works extra (e.g., pulled in for shortage), they're "owed" lighter future weeks
- Scheduler tracks the running balance and adjusts automatically
- The week-to-week split is flexible — the total over time should balance out
- Applies to all part-timers, each with their own pattern
- Still TBD: how quickly it balances (next week vs over longer stretch), max days in one week
