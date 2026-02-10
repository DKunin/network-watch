"use strict";

const PORT = 3031;
const SCAN_INTERVAL = 10000;
const DB_FILE = "device_log.json";
const SETTINGS_FILE = "notification_settings.json";
const TELEGRAM_DEBOUNCE_INTERVAL = 5 * 60 * 1000;
const NOTIFICATION_START_HOUR = 8;
const NOTIFICATION_END_HOUR = 24;

function asBoolean(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").toLowerCase()
  );
}

const IS_DEBUG = asBoolean(process.env.DEBUG);

module.exports = {
  PORT,
  SCAN_INTERVAL,
  DB_FILE,
  SETTINGS_FILE,
  TELEGRAM_DEBOUNCE_INTERVAL,
  NOTIFICATION_START_HOUR,
  NOTIFICATION_END_HOUR,
  IS_DEBUG,
};
