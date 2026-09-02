import { HttpError } from "./http";

export function validateOfflineOccurrence(value: string, receivedAt = new Date()): Date {
  const occurredAt = new Date(value);
  const age = receivedAt.getTime() - occurredAt.getTime();
  if (!Number.isFinite(occurredAt.getTime()) || age < -5 * 60 * 1000 || age > 30 * 24 * 60 * 60 * 1000) {
    throw new HttpError(422, "The saved punch time is outside the 30-day synchronization window.", "OFFLINE_PUNCH_TIME_INVALID");
  }
  return occurredAt;
}
