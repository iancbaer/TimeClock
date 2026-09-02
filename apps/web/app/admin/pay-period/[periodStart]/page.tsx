import type { Metadata } from "next";
import { CompanyPayPeriod } from "@/components/CompanyPayPeriod";

export const metadata: Metadata = { title: { absolute: "TimeClock — Company payroll report" } };

export default async function CompanyPayPeriodPage({ params }: { params: Promise<{ periodStart: string }> }) {
  const { periodStart } = await params;
  return <CompanyPayPeriod initialPeriodStart={periodStart} />;
}
