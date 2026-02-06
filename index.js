"use strict";

require("dotenv").config();
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const ping = require("ping");
const axios = require("axios");
const moment = require("moment");

const app = express();
const PORT = 3031;

app.use(cors());
app.use(express.static("public")); // Serve static frontend files

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DEBUG = process.env.DEBUG;
const NETWORK_SUBNET = "192.168.28"; // Change to match your router's subnet
const SCAN_INTERVAL = 10000; // Scan every 10 seconds
const DB_FILE = "device_log.json";
const TELEGRAM_DEBOUNCE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
let lastSentTime = 0;
let pendingMessage = null;
let timeoutId = null;


// List of devices to monitor (IP addresses)
const devices = {
  // "192.168.28.203": { name: "Kir Laptop" },
  // "192.168.28.235": { name: "Work Laptop" },
  "192.168.28.40": {
    name: "Kir's Phone",
    messages: {
      online: "✅ {name} is back online.",
      offline: "❌ {name} dropped offline.",
    },
    notifyOnSameStatus: true,
  },
  "192.168.28.22": {
    name: "TV",
    messages: {
      online: "✅ {name} is ready to stream.",
      offline: "❌ {name} is offline.",
    },
    notifyOnSameStatus: true,
  },
};

let deviceStatus = {};
let deviceLog = loadDatabase();

// Function to load database
function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    return JSON.parse(fs.readFileSync(DB_FILE));
  }
  return {};
}

// Function to save database
function saveDatabase() {
  fs.writeFileSync(DB_FILE, JSON.stringify(deviceLog, null, 2));
}

// Function to send Telegram alerts
async function sendTelegramMessage(message) {
  const now = Date.now();
  
  if (now - lastSentTime >= TELEGRAM_DEBOUNCE_INTERVAL) {
    // Enough time passed, send immediately
    await actuallySendMessage(message);
    lastSentTime = now;
  } else {
    // Schedule sending the latest message after the remaining time
    pendingMessage = message;
    
    if (!timeoutId) {
      const delay = TELEGRAM_DEBOUNCE_INTERVAL - (now - lastSentTime);
      timeoutId = setTimeout(async () => {
        await actuallySendMessage(pendingMessage);
        lastSentTime = Date.now();
        pendingMessage = null;
        timeoutId = null;
      }, delay);
    }
  }
}

async function actuallySendMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: message });
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
  }
}

// Function to scan devices on network
async function scanNetwork() {
  if (DEBUG) return;
  console.log("Scanning network...");
  const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const today = moment().format("YYYY-MM-DD");

  for (let ip in devices) {
    const isAlive = await pingDevice(ip);
    const deviceConfig = devices[ip];
    const deviceName = deviceConfig.name || ip;
    if (!(ip in deviceLog)) deviceLog[ip] = {};
    if (!(today in deviceLog[ip])) deviceLog[ip][today] = [];

    const statusLabel = isAlive ? "ONLINE" : "OFFLINE";
    const messageTemplate = isAlive
      ? deviceConfig?.messages?.online
      : deviceConfig?.messages?.offline;
    const fallbackMessage = `${isAlive ? "✅" : "❌"} ${deviceName} is now ${statusLabel}`;
    const messageText = (messageTemplate || fallbackMessage).replace(
      /\{name\}/g,
      deviceName
    );
    const shouldNotify =
      deviceConfig?.notifyOnSameStatus || deviceStatus[ip] !== isAlive;

    if (shouldNotify) {
      console.log(`${deviceName} is ${statusLabel}`);
      sendTelegramMessage(messageText);
    }

    if (isAlive && deviceStatus[ip] === false) {
      deviceLog[ip][today].push({
        status: "online",
        timestamp: currentTime,
      });
    } else if (!isAlive && deviceStatus[ip] === true) {
      deviceLog[ip][today].push({
        status: "offline",
        timestamp: currentTime,
      });
    }

    deviceStatus[ip] = isAlive;
  }

  saveDatabase();
}

// Function to ping devices
async function pingDevice(ip) {
  try {
    const res = await ping.promise.probe(ip, { timeout: 2 });
    return res.alive;
  } catch (error) {
    console.error(`Ping error for ${ip}:`, error);
    return false;
  }
}

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

app.get("/uptime/:ip/:date", (req, res) => {
  const { ip, date } = req.params;

  if (!deviceLog[ip] || !deviceLog[ip][date]) {
    return res.json({ error: "No data available for this device and date." });
  }

  const totalUptime = calculateUptime(deviceLog[ip][date], date);
  res.json({
    device: devices[ip]?.name || ip,
    date,
    uptime_seconds: totalUptime,
    uptime_human_readable: moment.utc(totalUptime * 1000).format("HH:mm:ss"),
  });
});

app.get("/weekly/:ip", (req, res) => {
  const { ip } = req.params;
  const uptimeData = loadDatabase();
  const result = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateString = date.toISOString().split("T")[0];
    const logEntries =
      uptimeData[ip] && uptimeData[ip][dateString]
        ? uptimeData[ip][dateString]
        : [];
    const totalUptime = calculateUptime(logEntries, dateString);
    const uptimeHours = (totalUptime / 3600).toFixed(2); // Convert seconds to hours
    result.push({ date: dateString, uptime: parseFloat(uptimeHours) });
  }

  res.json(result);
});

// API to get list of devices
app.get("/devices", (req, res) => {
  res.json(devices);
});

app.get("/status", (req, res) => {
  const statuses = {};

  for (const [ip, name] of Object.entries(devices)) {
    statuses[ip] = {
      name: name?.name || ip,
      isOnline: !!deviceStatus[ip],
    };
  }

  res.json(statuses);
});

// Serve frontend
app.use(express.static("public"));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Start scanning network periodically
setInterval(scanNetwork, SCAN_INTERVAL);
scanNetwork();
