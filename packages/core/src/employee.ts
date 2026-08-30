export const EMPLOYEE_NUMBER_MIN = 1001;
export const EMPLOYEE_NUMBER_MAX = 1999;

export function normalizeEmployeeNumber(value: string): string {
  const normalized = value.trim();
  const numeric = Number(normalized);
  if (!/^1\d{3}$/.test(normalized) || numeric < EMPLOYEE_NUMBER_MIN || numeric > EMPLOYEE_NUMBER_MAX) {
    throw new Error("Employee number must be between 1001 and 1999.");
  }
  return normalized;
}

export function nextEmployeeNumber(existing: Iterable<string>): string | null {
  const used = new Set(Array.from(existing, (value) => Number(value)));
  for (let candidate = EMPLOYEE_NUMBER_MIN; candidate <= EMPLOYEE_NUMBER_MAX; candidate += 1) {
    if (!used.has(candidate)) return String(candidate);
  }
  return null;
}
