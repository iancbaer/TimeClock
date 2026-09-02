import type { Metadata } from "next";
import { ChangeAdminPassword } from "@/components/ChangeAdminPassword";

export const metadata: Metadata = { title: { absolute: "TimeClock — Change manager password" } };

export default function ChangePasswordPage() {
  return <ChangeAdminPassword />;
}
