import Link from "next/link";
import { Schedule } from "@/components/Schedule";

export default function SchedulePage() {
  return <main className="admin-shell">
    <header className="admin-header"><div className="brand-mark">TC</div><div><p className="eyebrow">TimeClock Manager</p><h1>Scheduling</h1></div><Link className="admin-link" href="/admin">Manager home</Link></header>
    <Schedule />
  </main>;
}
