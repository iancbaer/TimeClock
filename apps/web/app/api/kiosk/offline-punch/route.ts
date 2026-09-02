import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { validateOfflineOccurrence } from "@/lib/offline-time";
import { requireOfflinePunchSession } from "@/lib/kiosk-auth";
import { recordEmployeePunch } from "@/lib/record-punch";
import { offlinePunchSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const [employee, input] = await Promise.all([
      requireOfflinePunchSession(request),
      request.json().then((body) => offlinePunchSchema.parse(body)),
    ]);
    const occurredAt = validateOfflineOccurrence(input.occurredAt);
    const punch = await recordEmployeePunch({ employeeId: employee.id, type: input.type, occurredAt, idempotencyKey: input.idempotencyKey, deviceLabel: input.deviceLabel, offlineQueued: true });
    return NextResponse.json({ punch: { id: punch.id, type: punch.type, occurredAt: punch.occurredAt } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
