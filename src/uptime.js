"use strict";

const moment = require("moment");

const TIMESTAMP_FORMAT = "YYYY-MM-DD HH:mm:ss";
const DATE_FORMAT = "YYYY-MM-DD";

function getSortedEvents(historyByDate) {
  if (!historyByDate || typeof historyByDate !== "object") {
    return [];
  }

  return Object.keys(historyByDate)
    .sort()
    .flatMap((day) => historyByDate[day] || [])
    .filter((entry) => entry && (entry.status === "online" || entry.status === "offline"))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function calculateUptime(historyByDate, date) {
  const dayBounds = getDayBounds(date);
  if (!dayBounds) {
    return 0;
  }

  const { dayStart, dayEnd } = dayBounds;
  const events = getSortedEvents(historyByDate);
  let totalUptime = 0;
  let currentState = "unknown";
  let intervalStart = dayStart.clone();

  for (const entry of events) {
    const entryTime = moment(entry.timestamp, TIMESTAMP_FORMAT, true);
    if (!entryTime.isValid()) {
      continue;
    }

    if (entryTime.isBefore(dayStart)) {
      currentState = entry.status;
      continue;
    }

    if (entryTime.isAfter(dayEnd)) {
      break;
    }

    if (currentState === "online") {
      totalUptime += entryTime.diff(intervalStart, "seconds");
    }

    intervalStart = entryTime;
    currentState = entry.status;
  }

  if (currentState === "online") {
    totalUptime += dayEnd.diff(intervalStart, "seconds");
  }

  return Math.max(totalUptime, 0);
}

function calculateHourlyUptime(historyByDate, date) {
  const dayBounds = getDayBounds(date);
  const hours = createEmptyHourlyBuckets();

  if (!dayBounds) {
    return hours;
  }

  const { dayStart, dayEnd } = dayBounds;
  const events = getSortedEvents(historyByDate);
  let currentState = "unknown";
  let intervalStart = dayStart.clone();

  for (const entry of events) {
    const entryTime = moment(entry.timestamp, TIMESTAMP_FORMAT, true);
    if (!entryTime.isValid()) {
      continue;
    }

    if (entryTime.isBefore(dayStart)) {
      currentState = entry.status;
      continue;
    }

    if (entryTime.isAfter(dayEnd)) {
      break;
    }

    if (currentState === "online") {
      addOnlineInterval(hours, intervalStart, entryTime);
    }

    intervalStart = entryTime;
    currentState = entry.status;
  }

  if (currentState === "online") {
    addOnlineInterval(hours, intervalStart, dayEnd);
  }

  return hours.map((bucket) => ({
    ...bucket,
    active_minutes: Number((bucket.active_seconds / 60).toFixed(2)),
    active_ratio: Number(Math.min(bucket.active_seconds / 3600, 1).toFixed(4)),
  }));
}

function getDayBounds(date) {
  const dayStart = moment(`${date} 00:00:00`, TIMESTAMP_FORMAT, true);
  if (!dayStart.isValid()) {
    return null;
  }

  const currentDate = moment().format(DATE_FORMAT);
  const dayEnd =
    date === currentDate
      ? moment()
      : moment(`${date} 23:59:59`, TIMESTAMP_FORMAT, true);

  if (!dayEnd.isValid() || dayEnd.isBefore(dayStart)) {
    return null;
  }

  return { dayStart, dayEnd };
}

function createEmptyHourlyBuckets() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    active_seconds: 0,
    active_minutes: 0,
    active_ratio: 0,
  }));
}

function addOnlineInterval(hours, start, end) {
  let cursor = start.clone();

  while (cursor.isBefore(end)) {
    const hour = cursor.hour();
    const nextHour = cursor.clone().startOf("hour").add(1, "hour");
    const segmentEnd = end.isBefore(nextHour) ? end : nextHour;
    const seconds = segmentEnd.diff(cursor, "seconds");

    if (seconds > 0 && hours[hour]) {
      hours[hour].active_seconds += seconds;
    }

    cursor = segmentEnd;
  }
}

module.exports = { calculateUptime, calculateHourlyUptime };
