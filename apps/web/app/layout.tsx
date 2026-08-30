import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: process.env.NEXT_PUBLIC_APP_NAME ?? "TimeClock",
    template: `%s · ${process.env.NEXT_PUBLIC_APP_NAME ?? "TimeClock"}`,
  },
  description: "Worker-protective timekeeping that preserves every hour worked in an accurate, auditable record.",
  applicationName: "TimeClock",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#102a2e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
