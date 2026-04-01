"use strict";

const ping = require("ping");
const moment = require("moment");

const STATE_UNKNOWN = "unknown";
const STATE_ONLINE = "online";
const STATE_OFFLINE = "offline";
const VALID_STATES = new Set([STATE_UNKNOWN, STATE_ONLINE, STATE_OFFLINE]);
const TIMESTAMP_FORMAT = "YYYY-MM-DD HH:mm:ss";

function normalizeState(value, fallback = STATE_UNKNOWN) {
  return VALID_STATES.has(value) ? value : fallback;
}

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  const parsed = moment(value, TIMESTAMP_FORMAT, true);
  return parsed.isValid() ? parsed.format(TIMESTAMP_FORMAT) : null;
}

function createEmptyStateRecord() {
  return {
    currentState: STATE_UNKNOWN,
    lastChangedAt: null,
    lastCheckedAt: null,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    pendingState: null,
    pendingStateSince: null,
  };
}

function normalizeStateRecord(record, fallback) {
  const normalized = {
    ...createEmptyStateRecord(),
    ...(record || {}),
  };
  const rawCurrentState = record?.currentState ?? record?.state;
  const rawPendingState = record?.pendingState;

  normalized.currentState = normalizeState(
    rawCurrentState,
    fallback?.currentState || STATE_UNKNOWN
  );
  normalized.lastChangedAt =
    normalizeTimestamp(normalized.lastChangedAt) ||
    normalizeTimestamp(fallback?.lastChangedAt);
  normalized.lastCheckedAt = normalizeTimestamp(normalized.lastCheckedAt);
  normalized.pendingState =
    rawPendingState === STATE_ONLINE || rawPendingState === STATE_OFFLINE
      ? rawPendingState
      : null;
  normalized.pendingStateSince = normalizeTimestamp(normalized.pendingStateSince);
  normalized.consecutiveSuccesses = Math.max(
    Number(normalized.consecutiveSuccesses) || 0,
    0
  );
  normalized.consecutiveFailures = Math.max(
    Number(normalized.consecutiveFailures) || 0,
    0
  );

  return normalized;
}

function getLatestLoggedEvent(historyByDate) {
  if (!historyByDate || typeof historyByDate !== "object") {
    return null;
  }

  const dates = Object.keys(historyByDate).sort();
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const entries = historyByDate[dates[index]];
    if (!Array.isArray(entries) || entries.length === 0) {
      continue;
    }

    return entries[entries.length - 1];
  }

  return null;
}

async function mapWithConcurrency(items, limit, iteratee) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}

function createScanner(options) {
  const devices = options.devices;
  const notifier = options.notifier;
  const saveDeviceLog = options.saveDeviceLog;
  const saveDeviceState = options.saveDeviceState;
  const debug = options.debug;
  const pingTimeoutSeconds = options.pingTimeoutSeconds;
  const pingConcurrency = options.pingConcurrency;
  const onlineSuccessThreshold = Math.max(options.onlineSuccessThreshold || 1, 1);
  const offlineFailureThreshold = Math.max(options.offlineFailureThreshold || 1, 1);

  const deviceLog = options.initialDeviceLog || {};
  const deviceState = Object.fromEntries(
    Object.entries(devices).map(([ip]) => {
      const latestEvent = getLatestLoggedEvent(deviceLog[ip]);
      const fallback = latestEvent
        ? {
            currentState: normalizeState(latestEvent.status),
            lastChangedAt: latestEvent.timestamp,
          }
        : null;

      return [ip, normalizeStateRecord(options.initialDeviceState?.[ip], fallback)];
    })
  );
  let scanInProgress = false;

  function buildMessage(deviceName, isAlive, deviceConfig) {
    const statusLabel = isAlive ? "ONLINE" : "OFFLINE";
    const template = isAlive
      ? deviceConfig?.messages?.online
      : deviceConfig?.messages?.offline;
    const fallback = `${isAlive ? "✅" : "❌"} ${deviceName} is now ${statusLabel}`;

    return (template || fallback).replace(/\{name\}/g, deviceName);
  }

  function ensureDeviceState(ip) {
    if (!deviceState[ip]) {
      deviceState[ip] = createEmptyStateRecord();
    }

    return deviceState[ip];
  }

  function getLastLoggedStatus(ip) {
    return getLatestLoggedEvent(deviceLog[ip])?.status || null;
  }

  function appendLogEntry(ip, nextState, timestamp) {
    const date = timestamp.split(" ")[0];

    if (!deviceLog[ip]) {
      deviceLog[ip] = {};
    }

    if (!deviceLog[ip][date]) {
      deviceLog[ip][date] = [];
    }

    const lastLoggedStatus = getLastLoggedStatus(ip);
    if (lastLoggedStatus === nextState) {
      return false;
    }

    deviceLog[ip][date].push({
      status: nextState,
      timestamp,
    });

    return true;
  }

  async function pingDevice([ip]) {
    try {
      const result = await ping.promise.probe(ip, {
        timeout: pingTimeoutSeconds,
      });

      return {
        ip,
        isAlive: result.alive,
        observedAt: moment().format(TIMESTAMP_FORMAT),
      };
    } catch (error) {
      console.error(`Ping error for ${ip}:`, error);

      return {
        ip,
        isAlive: false,
        observedAt: moment().format(TIMESTAMP_FORMAT),
      };
    }
  }

  async function processObservation(ip, deviceConfig, observation) {
    const stateRecord = ensureDeviceState(ip);
    const deviceName = deviceConfig?.name || ip;
    const nextObservedState = observation.isAlive ? STATE_ONLINE : STATE_OFFLINE;
    const confirmationThreshold =
      nextObservedState === STATE_ONLINE
        ? onlineSuccessThreshold
        : offlineFailureThreshold;

    stateRecord.lastCheckedAt = observation.observedAt;

    if (nextObservedState === STATE_ONLINE) {
      stateRecord.consecutiveSuccesses = Math.min(
        stateRecord.consecutiveSuccesses + 1,
        onlineSuccessThreshold
      );
      stateRecord.consecutiveFailures = 0;
    } else {
      stateRecord.consecutiveFailures = Math.min(
        stateRecord.consecutiveFailures + 1,
        offlineFailureThreshold
      );
      stateRecord.consecutiveSuccesses = 0;
    }

    if (stateRecord.currentState === nextObservedState) {
      stateRecord.pendingState = null;
      stateRecord.pendingStateSince = null;
      return false;
    }

    if (stateRecord.pendingState !== nextObservedState) {
      stateRecord.pendingState = nextObservedState;
      stateRecord.pendingStateSince = observation.observedAt;
    }

    const currentStreak =
      nextObservedState === STATE_ONLINE
        ? stateRecord.consecutiveSuccesses
        : stateRecord.consecutiveFailures;

    if (currentStreak < confirmationThreshold) {
      return false;
    }

    const previousState = stateRecord.currentState;
    const changedAt = stateRecord.pendingStateSince || observation.observedAt;

    stateRecord.currentState = nextObservedState;
    stateRecord.lastChangedAt = changedAt;
    stateRecord.pendingState = null;
    stateRecord.pendingStateSince = null;

    const didLogChange = appendLogEntry(ip, nextObservedState, changedAt);
    if (previousState !== STATE_UNKNOWN) {
      console.log(`${deviceName} is ${nextObservedState.toUpperCase()}`);
      await notifier.send(
        buildMessage(deviceName, nextObservedState === STATE_ONLINE, deviceConfig)
      );
    }

    return didLogChange;
  }

  async function scan() {
    if (debug || scanInProgress) {
      return;
    }

    scanInProgress = true;
    console.log("Scanning network...");
    let didChangeLog = false;

    try {
      const entries = Object.entries(devices);
      const probeResults = await mapWithConcurrency(
        entries,
        pingConcurrency,
        pingDevice
      );

      for (let index = 0; index < entries.length; index += 1) {
        const [ip, deviceConfig] = entries[index];
        const didLogDeviceChange = await processObservation(
          ip,
          deviceConfig,
          probeResults[index]
        );
        didChangeLog = didChangeLog || didLogDeviceChange;
      }
    } finally {
      if (didChangeLog) {
        saveDeviceLog(deviceLog);
      }

      saveDeviceState(deviceState);
      scanInProgress = false;
    }
  }

  function getStatuses() {
    const statuses = {};

    for (const [ip, config] of Object.entries(devices)) {
      const stateRecord = ensureDeviceState(ip);
      statuses[ip] = {
        name: config?.name || ip,
        state: stateRecord.currentState,
        isOnline: stateRecord.currentState === STATE_ONLINE,
        lastChangedAt: stateRecord.lastChangedAt,
        lastCheckedAt: stateRecord.lastCheckedAt,
      };
    }

    return statuses;
  }

  function getDeviceLog() {
    return deviceLog;
  }

  function getDeviceState() {
    return deviceState;
  }

  return {
    scan,
    getStatuses,
    getDeviceLog,
    getDeviceState,
  };
}

module.exports = { createScanner };
