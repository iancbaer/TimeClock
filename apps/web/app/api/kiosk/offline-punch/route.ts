import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/http";
import { requireOfflinePunchSession } from "@/lib/kiosk-auth";
import { recordEmployeePunch } from "@/lib/record-punch";
import { offlinePunchSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const [employee, input] = await Promise.all([
      requireOfflinePunchSession(request),
      request.json().then((body) => offlinePunchSchema.parse(body)),
    ]);
    const occurredAt = new Date(input.occurredAt);
    const age = Date.now() - occurredAt.getTime();
    if (age < -5 * 60 * 1000 || age > 30 * 24 * 60 * 60 * 1000) {
      throw new HttpError(422, "The saved punch time is outside the 30-day synchronization window.", "OFFLINE_PUNCH_TIME_INVALID");
    }
    const punch = await recordEmployeePunch({ employeeId: employee.id, type: input.type, occurredAt, idempotencyKey: input.idempotencyKey, deviceLabel: input.deviceLabel, offlineQueued: true });
    return NextResponse.json({ punch: { id: punch.id, type: punch.type, occurredAt: punch.occurredAt } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
