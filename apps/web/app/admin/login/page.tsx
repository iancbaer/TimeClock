import type { Metadata } from "next";
import { AdminLogin } from "@/components/AdminLogin";

export const metadata: Metadata = { title: { absolute: "Steward — Owner portal sign-in" } };

export default function AdminLoginPage() {
  return <AdminLogin />;
}
