import type { Metadata } from "next";
import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata: Metadata = { title: { absolute: "TimeClock — Manager view" } };

export default function AdminPage() {
  return <AdminDashboard />;
}
