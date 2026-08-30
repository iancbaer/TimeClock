import type { Metadata } from "next";
import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata: Metadata = { title: { absolute: "Steward — Owner portal" } };

export default function AdminPage() {
  return <AdminDashboard />;
}
