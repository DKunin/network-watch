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

// List of devices to monitor (IP addresses)
const devices = {
  // "192.168.28.203": "Kir Laptop",
  // "192.168.28.235": "Work Laptop",
  "192.168.28.22": "TV",
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
    const deviceName = devices[ip];
    if (!(ip in deviceLog)) deviceLog[ip] = {};
    if (!(today in deviceLog[ip])) deviceLog[ip][today] = [];

    if (isAlive && deviceStatus[ip] === false) {
      console.log(`${deviceName} (${ip}) is ONLINE`);
      sendTelegramMessage(`✅ ${deviceName} (${ip}) is now ONLINE`);
      deviceLog[ip][today].push({
        status: "online",
        timestamp: currentTime,
      });
    } else if (!isAlive && deviceStatus[ip] === true) {
      console.log(`${deviceName} (${ip}) is OFFLINE`);
      sendTelegramMessage(`❌ ${deviceName} (${ip}) is now OFFLINE`);
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
    totalUptime += moment(`${date} 23:59:59`, "YYYY-MM-DD HH:mm:ss").diff(
      lastOnlineTimestamp,
      "seconds"
    );
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
    device: devices[ip] || ip,
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
      name,
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
