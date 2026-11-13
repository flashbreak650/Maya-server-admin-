import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.waguard.mayaadmin',
  appName: 'WAGuard Admin',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SystemBars: {
      style: 'LIGHT',
    },
  },
};

export default config;
