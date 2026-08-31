import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireKioskSession } from "@/lib/kiosk-auth";
import { punchSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";
import { recordEmployeePunch } from "@/lib/record-punch";

export async function POST(request: Request) {
  try {
    const input = punchSchema.parse(await request.json());
    const [employee, settings] = await Promise.all([requireKioskSession(request), getSettings()]);

    const punch = await recordEmployeePunch({ employeeId: employee.id, type: input.type, occurredAt: new Date(), idempotencyKey: input.idempotencyKey, deviceLabel: input.deviceLabel });

    return NextResponse.json(
      {
        punch: { id: punch.id, type: punch.type, occurredAt: punch.occurredAt },
        timeZone: settings.timeZone,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
