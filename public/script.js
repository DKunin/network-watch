document.addEventListener("DOMContentLoaded", async () => {
  await loadDevices();
  setDefaultDate();
  await fetchCurrentStatus();

  document
    .getElementById("check-uptime")
    .addEventListener("click", fetchUptime);
  setTimeout(fetchUptime, 1500);
  setTimeout(fetchWeeklyUptime, 1500);
});

async function loadDevices() {
  try {
    const response = await fetch("/devices");
    const devices = await response.json();
    const deviceSelect = document.getElementById("device");

    for (const [ip, name] of Object.entries(devices)) {
      const option = document.createElement("option");
      option.value = ip;
      option.textContent = `${name} (${ip})`;
      deviceSelect.appendChild(option);
    }
  } catch (error) {
    console.error("Error loading devices:", error);
  }
}

function setDefaultDate() {
  const dateInput = document.getElementById("date");
  const today = new Date().toISOString().split("T")[0];
  dateInput.value = today;
}

async function fetchUptime() {
  const device = document.getElementById("device").value;
  const date = document.getElementById("date").value;

  if (!device || !date) {
    document.getElementById("result").textContent =
      "Please select both a device and a date.";
    return;
  }

  try {
    const response = await fetch(`/uptime/${device}/${date}`);
    const data = await response.json();

    if (data.error) {
      document.getElementById("result").textContent = data.error;
    } else {
      document.getElementById("result").textContent =
        `Device: ${data.device}\nDate: ${data.date}\nUptime: ${data.uptime_human_readable}`;
    }
  } catch (error) {
    console.error("Error fetching uptime:", error);
    document.getElementById("result").textContent =
      "An error occurred while fetching the uptime.";
  }
}

async function fetchCurrentStatus() {
  try {
    const response = await fetch("/status");
    const statuses = await response.json();
    const statusList = document.getElementById("device-status");
    statusList.innerHTML = "";

    for (const [ip, status] of Object.entries(statuses)) {
      const listItem = document.createElement("li");
      listItem.textContent = `${status.name} (${ip}): ${
        status.isOnline ? "ONLINE" : "OFFLINE"
      }`;
      statusList.appendChild(listItem);
    }
  } catch (error) {
    console.error("Error fetching current status:", error);
  }
}

function formatDecimalHours(hoursArray) {
  return hoursArray.map(decimalHours => {
    const hours = Math.floor(decimalHours);
    const minutes = Math.floor((decimalHours - hours) * 60);
    const minutesStr = minutes < 10 ? "0" + minutes : minutes;
    return `${hours}.${minutesStr}`;
  });
}

async function fetchWeeklyUptime() {
  const device = document.getElementById("device").value;
  if (!device) return;

  try {
    const response = await fetch(`/weekly/${device}`);
    const data = await response.json();

    const labels = data.map((entry) => entry.date);
    const uptimes = data.map((entry) => entry.uptime);
    // const uptimes = data.map((entry) => {
    //   const seconds = entry.uptime;
    //   const hours = Math.floor(seconds / 3600);
    //   const minutes = Math.floor((seconds % 3600) / 60);
    //   // Return a float value where the fractional part represents minutes in a two-digit format (e.g., 1.50 for 1h50m)
    //   return parseFloat(`${hours}.${minutes < 10 ? "0" : ""}${minutes}`);
    // });
    console.log(uptimes)
    renderChart(labels, formatDecimalHours(uptimes));
  } catch (error) {
    console.error("Error fetching weekly uptime:", error);
  }
}

function renderChart(labels, data) {
  const ctx = document.getElementById("uptimeChart").getContext("2d");
  if (window.uptimeChartInstance) {
    window.uptimeChartInstance.destroy();
  }
  window.uptimeChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Uptime (hours)",
          data: data,
          borderColor: "blue",
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });
}
