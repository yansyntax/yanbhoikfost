// PM2 Ecosystem Config — GOLD Signal Pro
// Reads environment variables from .env file in same directory
"use strict";

const path = require("path");
const fs = require("fs");

// Load .env file manually so pm2 picks up DATABASE_URL, SESSION_SECRET, PORT
const envFile = path.resolve(__dirname, ".env");
const env = {};
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const idx = trimmed.indexOf("=");
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = val;
    });
}

module.exports = {
  apps: [
    {
      name: "gold-signal-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "5000",
        ...env,
      },
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      merge_logs: true,
    },
  ],
};
