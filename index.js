"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const moment = require("moment");

const config = require("./src/config");
const devices = require("./src/devices");
const {
  loadDeviceLog,
  saveDeviceLog,
  loadNotificationSettings,
  saveNotificationSettings,
} = require("./src/storage");
const { calculateUptime } = require("./src/uptime");
const { TelegramNotifier } = require("./src/notifier");
const { createScanner } = require("./src/scanner");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const state = {
  notificationsEnabled:
    loadNotificationSettings(config.SETTINGS_FILE).notificationsEnabled,
};

const notifier = new TelegramNotifier({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  debounceInterval: config.TELEGRAM_DEBOUNCE_INTERVAL,
  notificationStartHour: config.NOTIFICATION_START_HOUR,
  notificationEndHour: config.NOTIFICATION_END_HOUR,
  isEnabled: () => state.notificationsEnabled,
});

const scanner = createScanner({
  devices,
  notifier,
  debug: config.IS_DEBUG,
  initialDeviceLog: loadDeviceLog(config.DB_FILE),
  saveDeviceLog: (deviceLog) => saveDeviceLog(config.DB_FILE, deviceLog),
});

app.get("/uptime/:ip/:date", (req, res) => {
  const { ip, date } = req.params;
  const deviceLog = scanner.getDeviceLog();

  if (!deviceLog[ip] || !deviceLog[ip][date]) {
    return res.json({ error: "No data available for this device and date." });
  }

  const totalUptime = calculateUptime(deviceLog[ip][date], date);

  return res.json({
    device: devices[ip]?.name || ip,
    date,
    uptime_seconds: totalUptime,
    uptime_human_readable: moment.utc(totalUptime * 1000).format("HH:mm:ss"),
  });
});

app.get("/weekly/:ip", (req, res) => {
  const { ip } = req.params;
  const deviceLog = scanner.getDeviceLog();
  const result = [];
  const today = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateString = date.toISOString().split("T")[0];

    const logEntries = deviceLog[ip]?.[dateString] || [];
    const totalUptime = calculateUptime(logEntries, dateString);
    const uptimeHours = (totalUptime / 3600).toFixed(2);

    result.push({ date: dateString, uptime: parseFloat(uptimeHours) });
  }

  return res.json(result);
});

app.get("/devices", (req, res) => {
  res.json(devices);
});

app.get("/status", (req, res) => {
  res.json(scanner.getStatuses());
});

app.get("/notifications", (req, res) => {
  res.json({ enabled: state.notificationsEnabled });
});

app.post("/notifications", (req, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean value." });
  }

  state.notificationsEnabled = enabled;
  saveNotificationSettings(config.SETTINGS_FILE, state.notificationsEnabled);

  return res.json({ enabled: state.notificationsEnabled });
});

app.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});

setInterval(() => {
  scanner.scan();
}, config.SCAN_INTERVAL);

scanner.scan();
