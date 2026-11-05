import { defineConfig } from "@playwright/test";
import { walletTestOrigin, walletTestSecret } from "./tests/browser-config.js";

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: [
    {
      command: "npm run start",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        HOSTNAME: "127.0.0.1",
        PORT: "3100",
        AUTH0_DOMAIN: "",
        AUTH0_AUDIENCE: "",
        AUTH0_CLIENT_ID: "",
        AUTH0_CLIENT_SECRET: "",
        AUTH0_SECRET: "",
      },
    },
    {
      command: "node tests/mock-wallet-api.js",
      url: "http://127.0.0.1:3102/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run start",
      url: walletTestOrigin,
      reuseExistingServer: false,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        HOSTNAME: "127.0.0.1",
        PORT: "3101",
        APP_ENV: "development",
        APP_BASE_URL: walletTestOrigin,
        BACKEND_API_URL: "http://127.0.0.1:3102",
        AUTH0_DOMAIN: "tenant.example.test",
        AUTH0_AUDIENCE: "https://wallet-api.example.test",
        AUTH0_CLIENT_ID: "wallet-browser-test",
        AUTH0_CLIENT_SECRET: "not-a-real-client-secret",
        AUTH0_SECRET: walletTestSecret,
        NODE_OPTIONS: "--import=./tests/mock-auth0-fetch.js",
      },
    },
  ],
});
