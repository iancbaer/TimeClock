import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nanshe",
    short_name: "Nanshe",
    description: "Accurate, auditable worker timekeeping and correction requests.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4ed",
    theme_color: "#102a2e",
    orientation: "portrait",
    icons: [],
  };
}
