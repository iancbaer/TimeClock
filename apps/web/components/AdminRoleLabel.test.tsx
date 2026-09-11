import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

it("renders distinct Global Admin and unchanged Admin account labels", async () => {
  const modules = import.meta.glob("./AdminRoleLabel.tsx") as Record<string, () => Promise<{ AdminRoleLabel: (props: { role: "ADMIN" | "GLOBAL_ADMIN" }) => ReturnType<typeof createElement> }>>;
  const component = (await modules["./AdminRoleLabel.tsx"]?.())?.AdminRoleLabel;
  expect(component, "role label component must exist").toBeDefined();
  expect(renderToStaticMarkup(createElement(component!, { role: "GLOBAL_ADMIN" }))).toContain("Global Admin");
  expect(renderToStaticMarkup(createElement(component!, { role: "ADMIN" }))).toBe("<small>Admin</small>");
});
