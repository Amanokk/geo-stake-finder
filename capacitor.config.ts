import type { CapacitorConfig } from "@capacitor/cli";

// App nativo Android (APK) — ver ANDROID.md para o passo a passo.
// O app nativo carrega o site publicado; o service worker cuida do modo offline.
const config: CapacitorConfig = {
  appId: "br.com.vitorlucas.estacagps",
  appName: "Estaca GPS",
  webDir: "dist",
  server: {
    url: "https://geo-stake-finder.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#020617",
  },
};

export default config;
