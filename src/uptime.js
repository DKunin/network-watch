"use strict";

const moment = require("moment");

function calculateUptime(logEntries, date) {
  let totalUptime = 0;
  let lastOnlineTimestamp = null;

  logEntries.forEach((entry) => {
    const entryTime = moment(entry.timestamp, "YYYY-MM-DD HH:mm:ss");

    if (entry.status === "online") {
      lastOnlineTimestamp = entryTime;
    } else if (entry.status === "offline" && lastOnlineTimestamp) {
      totalUptime += entryTime.diff(lastOnlineTimestamp, "seconds");
      lastOnlineTimestamp = null;
    }
  });

  if (lastOnlineTimestamp) {
    if (date === moment().format("YYYY-MM-DD")) {
      totalUptime += moment().diff(lastOnlineTimestamp, "seconds");
    } else {
      totalUptime += moment(`${date} 23:59:59`, "YYYY-MM-DD HH:mm:ss").diff(
        lastOnlineTimestamp,
        "seconds"
      );
    }
  }

  return totalUptime;
}

module.exports = { calculateUptime };
