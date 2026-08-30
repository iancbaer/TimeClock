import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.iancbaer.timeclock",
  appName: "TimeClock",
  webDir: "../kiosk/dist",
  backgroundColor: "#f1f2e9",
  android: {
    allowMixedContent: false,
    backgroundColor: "#f1f2e9",
  },
};

export default config;
