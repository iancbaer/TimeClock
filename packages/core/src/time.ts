import { DateTime, Interval } from "luxon";
import type {
  CalculationSettings,
  DaySummary,
  EffectivePunch,
  PunchType,
  TimesheetIssue,
  TimesheetSummary,
  WeekSummary,
} from "./types.js";

const HOUR_MS = 60 * 60 * 1000;

interface WorkSegment {
  start: DateTime;
  end: DateTime;
}

interface MealSegment {
  start: DateTime;
  end: DateTime;
}

interface MutableDay {
  date: string;
  punches: DaySummary["punches"];
  actualMilliseconds: number;
  mealMilliseconds: number;
  issues: TimesheetIssue[];
}

function localDate(date: DateTime, zone: string): string {
  return date.setZone(zone).toISODate() ?? "";
}

function issue(
  issues: TimesheetIssue[],
  code: TimesheetIssue["code"],
  message: string,
  date: string,
  punchId?: string,
): void {
  issues.push({ code, message, localDate: date, ...(punchId ? { punchId } : {}) });
}

function addSegmentToDays(
  segment: WorkSegment | MealSegment,
  zone: string,
  add: (date: string, milliseconds: number) => void,
): void {
  let cursor = segment.start;
  while (cursor < segment.end) {
    const nextMidnight = cursor.setZone(zone).plus({ days: 1 }).startOf("day");
    const boundary = nextMidnight < segment.end ? nextMidnight : segment.end;
    add(localDate(cursor, zone), boundary.toMillis() - cursor.toMillis());
    cursor = boundary;
  }
}

function getOrCreateDay(days: Map<string, MutableDay>, date: string): MutableDay {
  const existing = days.get(date);
  if (existing) return existing;
  const created: MutableDay = {
    date,
    punches: [],
    actualMilliseconds: 0,
    mealMilliseconds: 0,
    issues: [],
  };
  days.set(date, created);
  return created;
}

export function nextPunchType(punches: Pick<EffectivePunch, "type" | "occurredAt">[]): PunchType {
  let state: "OFF" | "WORKING" = "OFF";
  for (const punch of [...punches].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  )) {
    if (state === "OFF" && punch.type === "WORK_IN") state = "WORKING";
    else if (state === "WORKING" && punch.type === "WORK_OUT") state = "OFF";
  }
  return state === "OFF" ? "WORK_IN" : "WORK_OUT";
}

export function allowedPunchTypes(
  punches: Pick<EffectivePunch, "type" | "occurredAt">[],
): PunchType[] {
  return [nextPunchType(punches)];
}

export function calculateTimesheet(
  inputPunches: EffectivePunch[],
  settings: CalculationSettings,
): TimesheetSummary {
  const zone = settings.timeZone;
  const periodStart = DateTime.fromISO(settings.payPeriodStart, { zone }).startOf("day");
  if (!periodStart.isValid) throw new Error("Invalid pay period start date.");
  const periodDays = settings.payPeriodDays ?? 14;
  if (periodDays !== 14) throw new Error("Nanshe currently requires a 14-day pay period.");
  const periodEndExclusive = periodStart.plus({ days: periodDays });
  const asOf = settings.asOf ? DateTime.fromJSDate(new Date(settings.asOf), { zone }) : DateTime.now().setZone(zone);
  const punches = inputPunches
    .map((punch) => ({ ...punch, at: DateTime.fromJSDate(new Date(punch.occurredAt), { zone: "utc" }).setZone(zone) }))
    .filter((punch) => punch.at.isValid)
    .sort((a, b) => a.at.toMillis() - b.at.toMillis());

  const days = new Map<string, MutableDay>();
  for (let offset = 0; offset < periodDays; offset += 1) {
    getOrCreateDay(days, periodStart.plus({ days: offset }).toISODate() ?? "");
  }

  const issues: TimesheetIssue[] = [];
  const workSegments: WorkSegment[] = [];
  const mealSegments: MealSegment[] = [];
  let state: "OFF" | "WORKING" | "MEAL" = "OFF";
  let workStart: DateTime | null = null;
  let mealStart: DateTime | null = null;
  let shiftStart: DateTime | null = null;
  let shiftHadMeal = false;

  for (const punch of punches) {
    const date = localDate(punch.at, zone);
    if (punch.at >= periodStart && punch.at < periodEndExclusive) {
      getOrCreateDay(days, date).punches.push({
        id: punch.id,
        type: punch.type,
        occurredAt: punch.at.toUTC().toISO() ?? "",
        localTime: punch.at.toFormat("h:mm:ss a"),
        source: punch.source,
        revised: punch.revised ?? false,
        ...(punch.originalOccurredAt
          ? { originalOccurredAt: new Date(punch.originalOccurredAt).toISOString() }
          : {}),
        ...(punch.originalType ? { originalType: punch.originalType } : {}),
      });
    }

    if (punch.type === "WORK_IN" && state === "OFF") {
      state = "WORKING";
      workStart = punch.at;
      shiftStart = punch.at;
      shiftHadMeal = false;
      continue;
    }
    if (punch.type === "MEAL_START" && state === "WORKING" && workStart) {
      workSegments.push({ start: workStart, end: punch.at });
      state = "MEAL";
      mealStart = punch.at;
      workStart = null;
      shiftHadMeal = true;
      if (shiftStart && punch.at.diff(shiftStart).as("hours") > 5) {
        issue(issues, "LATE_MEAL", "Meal began after five elapsed hours in the shift.", date, punch.id);
      }
      continue;
    }
    if (punch.type === "MEAL_END" && state === "MEAL" && mealStart) {
      const meal = { start: mealStart, end: punch.at };
      mealSegments.push(meal);
      if (punch.at.diff(mealStart).as("minutes") < 30) {
        issue(issues, "SHORT_MEAL", "Recorded meal period is shorter than 30 minutes.", date, punch.id);
      }
      state = "WORKING";
      workStart = punch.at;
      mealStart = null;
      continue;
    }
    if (punch.type === "WORK_OUT" && state === "WORKING" && workStart) {
      workSegments.push({ start: workStart, end: punch.at });
      if (shiftStart && punch.at.diff(shiftStart).as("hours") > 5 && !shiftHadMeal) {
        issue(issues, "MISSING_MEAL", "Shift exceeded five hours without a recorded meal period.", date, punch.id);
      }
      state = "OFF";
      workStart = null;
      shiftStart = null;
      shiftHadMeal = false;
      continue;
    }
    if (punch.type === "WORK_OUT" && state === "MEAL" && mealStart) {
      mealSegments.push({ start: mealStart, end: punch.at });
      issue(issues, "OPEN_MEAL", "Meal end was missing; the recorded clock-out closed the historical meal state.", date, punch.id);
      state = "OFF";
      mealStart = null;
      shiftStart = null;
      shiftHadMeal = false;
      continue;
    }

    issue(
      issues,
      "UNEXPECTED_PUNCH",
      `Unexpected ${punch.type.replaceAll("_", " ").toLowerCase()} punch for the current clock state.`,
      date,
      punch.id,
    );
  }

  const openDate = localDate((mealStart ?? workStart ?? asOf).setZone(zone), zone);
  if (state === "WORKING" && workStart) {
    issue(issues, "OPEN_WORK_SEGMENT", "Clock-in has no matching clock-out yet.", openDate);
  }
  if (state === "MEAL" && mealStart) {
    issue(issues, "OPEN_MEAL", "Meal start has no matching meal end yet.", openDate);
  }

  const periodInterval = Interval.fromDateTimes(periodStart, periodEndExclusive);
  for (const segment of workSegments) {
    const clipped = Interval.fromDateTimes(segment.start, segment.end).intersection(periodInterval);
    if (!clipped?.isValid || clipped.isEmpty()) continue;
    addSegmentToDays({ start: clipped.start!, end: clipped.end! }, zone, (date, milliseconds) => {
      getOrCreateDay(days, date).actualMilliseconds += milliseconds;
    });
  }
  for (const segment of mealSegments) {
    const clipped = Interval.fromDateTimes(segment.start, segment.end).intersection(periodInterval);
    if (!clipped?.isValid || clipped.isEmpty()) continue;
    addSegmentToDays({ start: clipped.start!, end: clipped.end! }, zone, (date, milliseconds) => {
      getOrCreateDay(days, date).mealMilliseconds += milliseconds;
    });
  }

  for (const item of issues) {
    if (days.has(item.localDate)) getOrCreateDay(days, item.localDate).issues.push(item);
  }

  const intervalMilliseconds = settings.roundingIntervalMinutes * 60 * 1000;
  const daySummaries = [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map<DaySummary>((day) => {
      const rounded =
        settings.roundingMode === "EMPLOYEE_FAVOR_DAILY_CEILING" && day.actualMilliseconds > 0
          ? Math.ceil(day.actualMilliseconds / intervalMilliseconds) * intervalMilliseconds
          : day.actualMilliseconds;
      return {
        date: day.date,
        punches: day.punches.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
        actualMilliseconds: day.actualMilliseconds,
        creditMilliseconds: rounded - day.actualMilliseconds,
        payableMilliseconds: rounded,
        mealMilliseconds: day.mealMilliseconds,
        issues: day.issues,
      };
    });

  const buildWeek = (weekNumber: 1 | 2, startIndex: number): WeekSummary => {
    const weekDays = daySummaries.slice(startIndex, startIndex + 7);
    const actualMilliseconds = weekDays.reduce((sum, day) => sum + day.actualMilliseconds, 0);
    const creditMilliseconds = weekDays.reduce((sum, day) => sum + day.creditMilliseconds, 0);
    const payableMilliseconds = actualMilliseconds + creditMilliseconds;
    const overtimeMilliseconds = Math.max(0, payableMilliseconds - 40 * HOUR_MS);
    return {
      weekNumber,
      startDate: weekDays[0]?.date ?? "",
      endDate: weekDays[6]?.date ?? "",
      days: weekDays,
      actualMilliseconds,
      creditMilliseconds,
      payableMilliseconds,
      regularMilliseconds: payableMilliseconds - overtimeMilliseconds,
      overtimeMilliseconds,
      issues: weekDays.flatMap((day) => day.issues),
    };
  };

  const weeks: [WeekSummary, WeekSummary] = [buildWeek(1, 0), buildWeek(2, 7)];
  return {
    periodStart: periodStart.toISODate() ?? "",
    periodEnd: periodEndExclusive.minus({ days: 1 }).toISODate() ?? "",
    weeks,
    actualMilliseconds: weeks.reduce((sum, week) => sum + week.actualMilliseconds, 0),
    creditMilliseconds: weeks.reduce((sum, week) => sum + week.creditMilliseconds, 0),
    payableMilliseconds: weeks.reduce((sum, week) => sum + week.payableMilliseconds, 0),
    regularMilliseconds: weeks.reduce((sum, week) => sum + week.regularMilliseconds, 0),
    overtimeMilliseconds: weeks.reduce((sum, week) => sum + week.overtimeMilliseconds, 0),
    issues: weeks.flatMap((week) => week.issues),
  };
}

export function payPeriodContaining(anchorDate: string, targetDate: string, timeZone: string): string {
  const anchor = DateTime.fromISO(anchorDate, { zone: timeZone }).startOf("day");
  const target = DateTime.fromISO(targetDate, { zone: timeZone }).startOf("day");
  if (!anchor.isValid || !target.isValid) throw new Error("Invalid pay period date.");
  const dayDifference = Math.floor(target.diff(anchor, "days").days);
  const periods = Math.floor(dayDifference / 14);
  return anchor.plus({ days: periods * 14 }).toISODate() ?? "";
}

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.abs(totalMinutes % 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}
