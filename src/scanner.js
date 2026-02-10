"use strict";

const ping = require("ping");
const moment = require("moment");

function createScanner(options) {
  const devices = options.devices;
  const notifier = options.notifier;
  const saveDeviceLog = options.saveDeviceLog;
  const debug = options.debug;

  const deviceStatus = {};
  const deviceLog = options.initialDeviceLog || {};
  let scanInProgress = false;

  function buildMessage(deviceName, isAlive, deviceConfig) {
    const statusLabel = isAlive ? "ONLINE" : "OFFLINE";
    const template = isAlive
      ? deviceConfig?.messages?.online
      : deviceConfig?.messages?.offline;
    const fallback = `${isAlive ? "✅" : "❌"} ${deviceName} is now ${statusLabel}`;

    return (template || fallback).replace(/\{name\}/g, deviceName);
  }

  function getLastLoggedStatus(ip) {
    const historyByDate = deviceLog[ip];
    if (!historyByDate) {
      return null;
    }

    const dates = Object.keys(historyByDate).sort();
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      const entries = historyByDate[dates[i]];
      if (!Array.isArray(entries) || entries.length === 0) {
        continue;
      }
      return entries[entries.length - 1].status || null;
    }

    return null;
  }

  async function pingDevice(ip) {
    try {
      const result = await ping.promise.probe(ip, { timeout: 2 });
      return result.alive;
    } catch (error) {
      console.error(`Ping error for ${ip}:`, error);
      return false;
    }
  }

  async function scan() {
    if (debug || scanInProgress) {
      return;
    }

    scanInProgress = true;
    console.log("Scanning network...");

    const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const today = moment().format("YYYY-MM-DD");
    let didChangeLog = false;

    try {
      for (const [ip, deviceConfig] of Object.entries(devices)) {
        const isAlive = await pingDevice(ip);
        const deviceName = deviceConfig?.name || ip;

        if (!deviceLog[ip]) {
          deviceLog[ip] = {};
        }

        if (!deviceLog[ip][today]) {
          deviceLog[ip][today] = [];
        }

        const previousStatus = deviceStatus[ip];
        const isKnownStatus = typeof previousStatus === "boolean";
        const didStatusChange = isKnownStatus && previousStatus !== isAlive;

        if (didStatusChange) {
          const nextStatus = isAlive ? "online" : "offline";
          const lastLoggedStatus = getLastLoggedStatus(ip);
          const isDuplicateStatus = lastLoggedStatus === nextStatus;

          if (!isDuplicateStatus) {
            deviceLog[ip][today].push({
              status: nextStatus,
              timestamp: currentTime,
            });
            didChangeLog = true;

            console.log(`${deviceName} is ${nextStatus.toUpperCase()}`);
            await notifier.send(buildMessage(deviceName, isAlive, deviceConfig));
          }
        }

        deviceStatus[ip] = isAlive;
      }

      if (didChangeLog) {
        saveDeviceLog(deviceLog);
      }
    } finally {
      scanInProgress = false;
    }
  }

  function getStatuses() {
    const statuses = {};

    for (const [ip, config] of Object.entries(devices)) {
      statuses[ip] = {
        name: config?.name || ip,
        isOnline: !!deviceStatus[ip],
      };
    }

    return statuses;
  }

  function getDeviceLog() {
    return deviceLog;
  }

  return {
    scan,
    getStatuses,
    getDeviceLog,
  };
}

module.exports = { createScanner };
