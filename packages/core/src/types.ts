export const PUNCH_TYPES = ["WORK_IN", "MEAL_START", "MEAL_END", "WORK_OUT"] as const;
export type PunchType = (typeof PUNCH_TYPES)[number];

export type RoundingMode = "EXACT" | "EMPLOYEE_FAVOR_DAILY_CEILING";

export interface EffectivePunch {
  id: string;
  type: PunchType;
  occurredAt: string | Date;
  originalOccurredAt?: string | Date;
  originalType?: PunchType;
  source?: string;
  revised?: boolean;
}

export interface CalculationSettings {
  timeZone: string;
  roundingMode: RoundingMode;
  roundingIntervalMinutes: number;
  payPeriodStart: string;
  payPeriodDays?: number;
  asOf?: string | Date;
}

export interface TimesheetIssue {
  code:
    | "UNEXPECTED_PUNCH"
    | "OPEN_WORK_SEGMENT"
    | "OPEN_MEAL"
    | "SHORT_MEAL"
    | "LATE_MEAL"
    | "MISSING_MEAL";
  message: string;
  punchId?: string;
  localDate: string;
}

export interface PunchView {
  id: string;
  type: PunchType;
  occurredAt: string;
  localTime: string;
  source?: string;
  revised: boolean;
  originalOccurredAt?: string;
  originalType?: PunchType;
}

export interface DaySummary {
  date: string;
  punches: PunchView[];
  actualMilliseconds: number;
  creditMilliseconds: number;
  payableMilliseconds: number;
  mealMilliseconds: number;
  issues: TimesheetIssue[];
}

export interface WeekSummary {
  weekNumber: 1 | 2;
  startDate: string;
  endDate: string;
  days: DaySummary[];
  actualMilliseconds: number;
  creditMilliseconds: number;
  payableMilliseconds: number;
  regularMilliseconds: number;
  overtimeMilliseconds: number;
  issues: TimesheetIssue[];
}

export interface TimesheetSummary {
  periodStart: string;
  periodEnd: string;
  weeks: [WeekSummary, WeekSummary];
  actualMilliseconds: number;
  creditMilliseconds: number;
  payableMilliseconds: number;
  regularMilliseconds: number;
  overtimeMilliseconds: number;
  issues: TimesheetIssue[];
}
