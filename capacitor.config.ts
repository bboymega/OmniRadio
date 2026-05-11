import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "live.omni.radio",

  appName: "OmniRadio",

  webDir: "out",

  server: {
    cleartext: true,

    androidScheme: "https",
  },

  android: {
    allowMixedContent: true,
  },
};

export default config;