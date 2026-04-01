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
  const dayStart = moment(`${date} 00:00:00`, TIMESTAMP_FORMAT, true);
  if (!dayStart.isValid()) {
    return 0;
  }

  const currentDate = moment().format(DATE_FORMAT);
  const dayEnd =
    date === currentDate
      ? moment()
      : moment(`${date} 23:59:59`, TIMESTAMP_FORMAT, true);

  if (!dayEnd.isValid() || dayEnd.isBefore(dayStart)) {
    return 0;
  }

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

module.exports = { calculateUptime };
