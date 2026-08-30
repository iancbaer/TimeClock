import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.iancbaer.nanshe",
  appName: "Nanshe",
  webDir: "../kiosk/dist",
  backgroundColor: "#f1f2e9",
  android: {
    allowMixedContent: false,
    backgroundColor: "#f1f2e9",
  },
};

export default config;
