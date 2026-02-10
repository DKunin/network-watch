"use strict";

const fs = require("fs");

function readJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error);
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function loadDeviceLog(dbFile) {
  return readJsonFile(dbFile, {});
}

function saveDeviceLog(dbFile, deviceLog) {
  writeJsonFile(dbFile, deviceLog);
}

function loadNotificationSettings(settingsFile) {
  return readJsonFile(settingsFile, { notificationsEnabled: false });
}

function saveNotificationSettings(settingsFile, notificationsEnabled) {
  writeJsonFile(settingsFile, { notificationsEnabled });
}

module.exports = {
  loadDeviceLog,
  saveDeviceLog,
  loadNotificationSettings,
  saveNotificationSettings,
};
