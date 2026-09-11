import { createElement } from "react";

export function AdminRoleLabel({ role }: { role: "ADMIN" | "GLOBAL_ADMIN" }) {
  return createElement("small", null, role === "GLOBAL_ADMIN" ? "Global Admin" : "Admin");
}
