import type { Metadata } from "next";
import { EmployeeTimesheet } from "@/components/EmployeeTimesheet";

export const metadata: Metadata = { title: { absolute: "TimeClock — Worker time sheet" } };

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodStart?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <EmployeeTimesheet employeeId={id} initialPeriodStart={query.periodStart} />;
}
