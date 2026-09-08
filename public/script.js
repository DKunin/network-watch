const { createApp, markRaw } = Vue;

const CONNECTION_STATES = {
  ONLINE: "online",
  OFFLINE: "offline",
  UNKNOWN: "unknown",
};
const getTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function formatDate(dateString, options) {
  if (!dateString) {
    return "--";
  }

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function formatHours(hours) {
  const numericHours = Number(hours);
  if (!Number.isFinite(numericHours)) {
    return "--";
  }

  const totalMinutes = Math.round(numericHours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDuration(totalSeconds) {
  const numericSeconds = Number(totalSeconds);
  if (!Number.isFinite(numericSeconds) || numericSeconds <= 0) {
    return "0m";
  }

  const totalMinutes = Math.round(numericSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function createEmptyHourlyActivity() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    active_seconds: 0,
    active_minutes: 0,
    active_ratio: 0,
  }));
}

function normalizeHourlyActivity(hours) {
  const buckets = createEmptyHourlyActivity();

  if (!Array.isArray(hours)) {
    return buckets;
  }

  hours.forEach((entry) => {
    const hour = Number(entry?.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return;
    }

    const activeSeconds = Math.max(0, Number(entry.active_seconds) || 0);
    const activeMinutes = Math.min(60, Math.max(0, Number(entry.active_minutes) || 0));
    const activeRatio = Math.min(1, Math.max(0, Number(entry.active_ratio) || 0));

    buckets[hour] = {
      hour,
      active_seconds: activeSeconds,
      active_minutes: activeMinutes,
      active_ratio: activeRatio,
    };
  });

  return buckets;
}

function getDeviceName(device) {
  if (typeof device === "string") {
    return device;
  }

  if (device && typeof device === "object") {
    return device.name || "Unnamed device";
  }

  return "";
}

function normalizeConnectionState(state) {
  if (state === true) {
    return CONNECTION_STATES.ONLINE;
  }

  if (state === false) {
    return CONNECTION_STATES.OFFLINE;
  }

  if (
    state === CONNECTION_STATES.ONLINE ||
    state === CONNECTION_STATES.OFFLINE ||
    state === CONNECTION_STATES.UNKNOWN
  ) {
    return state;
  }

  return CONNECTION_STATES.UNKNOWN;
}

function getStateLabel(state) {
  switch (normalizeConnectionState(state)) {
    case CONNECTION_STATES.ONLINE:
      return "Online";
    case CONNECTION_STATES.OFFLINE:
      return "Offline";
    case CONNECTION_STATES.UNKNOWN:
    default:
      return "Unknown";
  }
}

function normalizeDevicesMap(devices) {
  return Object.fromEntries(
    Object.entries(devices || {}).map(([ip, device]) => [ip, getDeviceName(device) || ip])
  );
}

function normalizeStatusesMap(statuses, devices) {
  return Object.fromEntries(
    Object.entries(statuses || {}).map(([ip, status]) => [
      ip,
      {
        ...status,
        state: normalizeConnectionState(status?.state ?? status?.currentState ?? status?.isOnline),
        name: getDeviceName(status?.name) || devices[ip] || ip,
      },
    ])
  );
}

createApp({
  data() {
    return {
      devices: {},
      statuses: {},
      weeklyUptime: [],
      hourlyActivity: createEmptyHourlyActivity(),
      selectedDevice: "",
      selectedDate: getTodayString(),
      activityError: "",
      isBootstrapping: true,
      isLoadingActivity: false,
      isLoadingWeekly: false,
      isRefreshingDashboard: false,
      lastUpdatedAt: null,
      refreshTimer: null,
      uptimeChart: null,
      activityRequestId: 0,
      weeklyRequestId: 0,
    };
  },

  computed: {
    deviceOptions() {
      return Object.entries(this.devices).map(([ip, device]) => ({
        ip,
        name: getDeviceName(device),
      }));
    },

    deviceRows() {
      return this.deviceOptions.map(({ ip, name }) => {
        const state = normalizeConnectionState(this.statuses[ip]?.state);

        return {
          ip,
          name,
          state,
          stateLabel: getStateLabel(state),
        };
      });
    },

    totalDevices() {
      return this.deviceOptions.length;
    },

    selectedDeviceLabel() {
      return (
        getDeviceName(this.devices[this.selectedDevice]) ||
        this.selectedDevice ||
        "Choose a device"
      );
    },

    weeklyAverageHours() {
      if (!this.weeklyUptime.length) {
        return null;
      }

      const total = this.weeklyUptime.reduce(
        (sum, entry) => sum + Number(entry.uptime || 0),
        0
      );

      return total / this.weeklyUptime.length;
    },

    weeklyAverageLabel() {
      return this.weeklyAverageHours === null
        ? "--"
        : formatHours(this.weeklyAverageHours);
    },

    bestDay() {
      if (!this.weeklyUptime.length) {
        return null;
      }

      return this.weeklyUptime.reduce((best, entry) =>
        Number(entry.uptime || 0) > Number(best.uptime || 0) ? entry : best
      );
    },

    worstDay() {
      if (!this.weeklyUptime.length) {
        return null;
      }

      return this.weeklyUptime.reduce((worst, entry) =>
        Number(entry.uptime || 0) < Number(worst.uptime || 0) ? entry : worst
      );
    },

    bestDayLabel() {
      return this.bestDay
        ? formatDate(this.bestDay.date, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "--";
    },

    bestDayUptimeLabel() {
      return this.bestDay ? formatHours(this.bestDay.uptime) : "--";
    },

    worstDayLabel() {
      return this.worstDay
        ? formatDate(this.worstDay.date, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "--";
    },

    worstDayUptimeLabel() {
      return this.worstDay ? formatHours(this.worstDay.uptime) : "--";
    },

    activityTotalSeconds() {
      return this.hourlyActivity.reduce(
        (sum, entry) => sum + Number(entry.active_seconds || 0),
        0
      );
    },

    activityTotalLabel() {
      return this.isLoadingActivity
        ? "Updating..."
        : formatDuration(this.activityTotalSeconds);
    },

    peakActivityHour() {
      return this.hourlyActivity.reduce((peak, entry) =>
        Number(entry.active_seconds || 0) > Number(peak.active_seconds || 0)
          ? entry
          : peak
      );
    },

    peakActivityLabel() {
      if (this.isLoadingActivity) {
        return "Updating...";
      }

      if (!this.peakActivityHour?.active_seconds) {
        return "--";
      }

      const hour = String(this.peakActivityHour.hour).padStart(2, "0");
      const minutes = Math.round(this.peakActivityHour.active_minutes);
      return `${hour} · ${minutes}m`;
    },

    hasTrendData() {
      return this.weeklyUptime.some((entry) => Number(entry.uptime || 0) > 0);
    },

    trendEmptyStateText() {
      if (this.isLoadingWeekly) {
        return "Loading the last seven days of uptime.";
      }

      return "No uptime changes were recorded for the last seven days.";
    },

    trendChartMax() {
      const maxHours = Math.max(
        ...this.weeklyUptime.map((entry) => Number(entry.uptime || 0)),
        0
      );

      if (maxHours <= 1) {
        return 1;
      }

      if (maxHours <= 6) {
        return Math.ceil(maxHours + 1);
      }

      if (maxHours <= 12) {
        return Math.ceil(maxHours + 2);
      }

      return Math.min(25, Math.ceil(maxHours + 1));
    },

    trendTickStep() {
      if (this.trendChartMax <= 1) {
        return 0.25;
      }

      if (this.trendChartMax <= 4) {
        return 0.5;
      }

      if (this.trendChartMax <= 12) {
        return 1;
      }

      return 2;
    },

    formattedLastUpdated() {
      if (!this.lastUpdatedAt) {
        return "waiting";
      }

      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(this.lastUpdatedAt);
    },
  },

  watch: {
    async selectedDevice(newValue, oldValue) {
      if (!newValue || this.isBootstrapping || newValue === oldValue) {
        return;
      }

      await Promise.all([
        this.fetchHourlyActivity(),
        this.fetchWeeklyUptime(),
      ]);
    },

    async selectedDate(newValue, oldValue) {
      if (!newValue || this.isBootstrapping || newValue === oldValue) {
        return;
      }

      await this.fetchHourlyActivity();
    },
  },

  async mounted() {
    await this.initializeDashboard();
  },

  beforeUnmount() {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
    }

    if (this.uptimeChart) {
      this.uptimeChart.destroy();
      this.uptimeChart = null;
    }
  },

  methods: {
    async initializeDashboard() {
      try {
        await Promise.all([
          this.loadDevices(),
          this.fetchCurrentStatus(),
        ]);

        if (this.selectedDevice) {
          await Promise.all([
            this.fetchHourlyActivity(),
            this.fetchWeeklyUptime(),
          ]);
        }
      } finally {
        this.isBootstrapping = false;
      }

      this.refreshTimer = window.setInterval(() => {
        this.fetchCurrentStatus();
      }, 30000);
    },

    async loadDevices() {
      try {
        const response = await fetch("/devices");
        if (!response.ok) {
          throw new Error("Failed to load devices.");
        }

        const devices = normalizeDevicesMap(await response.json());
        this.devices = devices;

        if (!this.selectedDevice) {
          const [firstDeviceIp] = Object.keys(devices);
          this.selectedDevice = firstDeviceIp || "";
        }
      } catch (error) {
        console.error("Error loading devices:", error);
      }
    },

    async fetchCurrentStatus() {
      try {
        const response = await fetch("/status");
        if (!response.ok) {
          throw new Error("Failed to load status.");
        }

        this.statuses = normalizeStatusesMap(await response.json(), this.devices);
        this.lastUpdatedAt = new Date();
      } catch (error) {
        console.error("Error fetching current status:", error);
      }
    },

    async fetchHourlyActivity() {
      const requestId = ++this.activityRequestId;
      const device = this.selectedDevice;
      const date = this.selectedDate;

      if (!device || !date) {
        this.hourlyActivity = createEmptyHourlyActivity();
        this.activityError = "Choose both a device and a date.";
        this.isLoadingActivity = false;
        return;
      }

      this.isLoadingActivity = true;

      try {
        const response = await fetch(`/activity/${device}/${date}`);
        if (!response.ok) {
          throw new Error("Failed to load hourly activity.");
        }

        const data = await response.json();
        if (requestId !== this.activityRequestId || device !== this.selectedDevice) {
          return;
        }

        if (data.error) {
          this.hourlyActivity = createEmptyHourlyActivity();
          this.activityError = data.error;
          return;
        }

        this.hourlyActivity = normalizeHourlyActivity(data.hours);
        this.activityError = "";
      } catch (error) {
        if (requestId !== this.activityRequestId || device !== this.selectedDevice) {
          return;
        }

        console.error("Error fetching hourly activity:", error);
        this.hourlyActivity = createEmptyHourlyActivity();
        this.activityError = "An error occurred while fetching hourly activity.";
      } finally {
        if (requestId === this.activityRequestId) {
          this.isLoadingActivity = false;
        }
      }
    },

    async fetchWeeklyUptime() {
      const requestId = ++this.weeklyRequestId;
      const device = this.selectedDevice;

      if (!device) {
        this.weeklyUptime = [];
        this.isLoadingWeekly = false;
        this.renderChart();
        return;
      }

      this.isLoadingWeekly = true;

      try {
        const response = await fetch(`/weekly/${device}`);
        if (!response.ok) {
          throw new Error("Failed to load weekly uptime.");
        }

        const data = await response.json();
        if (requestId !== this.weeklyRequestId || device !== this.selectedDevice) {
          return;
        }

        this.weeklyUptime = Array.isArray(data) ? data : [];
        this.$nextTick(() => {
          if (requestId === this.weeklyRequestId && device === this.selectedDevice) {
            this.renderChart();
          }
        });
      } catch (error) {
        if (requestId !== this.weeklyRequestId || device !== this.selectedDevice) {
          return;
        }

        console.error("Error fetching weekly uptime:", error);
        this.weeklyUptime = [];
        this.$nextTick(() => {
          if (requestId === this.weeklyRequestId && device === this.selectedDevice) {
            this.renderChart();
          }
        });
      } finally {
        if (requestId === this.weeklyRequestId) {
          this.isLoadingWeekly = false;
        }
      }
    },

    async refreshDashboard() {
      if (!this.selectedDevice) {
        return;
      }

      this.isRefreshingDashboard = true;

      try {
        await Promise.all([
          this.fetchCurrentStatus(),
          this.fetchHourlyActivity(),
          this.fetchWeeklyUptime(),
        ]);
      } finally {
        this.isRefreshingDashboard = false;
      }
    },

    selectDevice(ip) {
      this.selectedDevice = ip;
    },

    formatChartLabel(dateString) {
      return formatDate(dateString, { weekday: "short", day: "numeric" });
    },

    activityCellStyle(entry) {
      const ratio = Math.min(1, Math.max(0, Number(entry.active_ratio) || 0));
      if (!ratio) {
        return {};
      }

      const start = [34, 103, 145];
      const end = [92, 231, 189];
      const color = start.map((channel, index) =>
        Math.round(channel + (end[index] - channel) * ratio)
      );
      const alpha = 0.68 + ratio * 0.3;

      return {
        "--activity-color": `rgba(${color.join(", ")}, ${alpha})`,
        "--activity-border-color": `rgba(${color.join(", ")}, ${Math.min(
          1,
          alpha + 0.08
        )})`,
      };
    },

    activityCellLabel(entry) {
      const hour = String(entry.hour).padStart(2, "0");
      const minutes = Math.round(Number(entry.active_minutes) || 0);
      return `${hour}:00, ${minutes} active ${minutes === 1 ? "minute" : "minutes"}`;
    },

    activityCellTooltip(entry) {
      const hour = String(entry.hour).padStart(2, "0");
      const minutes = Math.round(Number(entry.active_minutes) || 0);
      return `${hour}:00 · ${minutes} min online`;
    },

    renderChart() {
      const canvas = this.$refs.uptimeChart;
      if (!canvas) {
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      if (!this.hasTrendData) {
        if (this.uptimeChart) {
          this.uptimeChart.stop();
          this.uptimeChart.data.labels = [];
          this.uptimeChart.data.datasets[0].data = [];
          this.uptimeChart.update("none");
        }

        return;
      }

      const gradient = context.createLinearGradient(0, 0, 0, canvas.height || 320);
      gradient.addColorStop(0, "rgba(92, 231, 189, 0.28)");
      gradient.addColorStop(1, "rgba(92, 231, 189, 0.015)");

      const labels = this.weeklyUptime.map((entry) =>
        this.formatChartLabel(entry.date)
      );
      const values = this.weeklyUptime.map((entry) => Number(entry.uptime || 0));

      if (this.uptimeChart) {
        this.uptimeChart.stop();
        this.uptimeChart.data.labels = labels;
        this.uptimeChart.data.datasets[0].data = values;
        this.uptimeChart.data.datasets[0].backgroundColor = gradient;
        this.uptimeChart.options.scales.y.max = this.trendChartMax;
        this.uptimeChart.options.scales.y.ticks.stepSize = this.trendTickStep;
        this.uptimeChart.resize();
        this.uptimeChart.update();
        return;
      }

      this.uptimeChart = markRaw(new Chart(context, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Uptime (hours)",
              data: values,
              borderColor: "#5ce7bd",
              backgroundColor: gradient,
              fill: true,
              tension: 0.35,
              borderWidth: 3,
              pointRadius: 4,
              pointHoverRadius: 5,
              pointBackgroundColor: "#5ce7bd",
              pointBorderColor: "#0d1b2d",
              pointBorderWidth: 2,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          animation: {
            duration: 700,
            easing: "easeOutQuart",
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              displayColors: false,
              backgroundColor: "#050c16",
              padding: 12,
              titleFont: {
                family: "Manrope",
                weight: "700",
              },
              bodyFont: {
                family: "Manrope",
              },
              callbacks: {
                title: (items) => {
                  const entry = this.weeklyUptime[items[0].dataIndex];
                  return formatDate(entry?.date, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  });
                },
                label: (item) => `Uptime ${formatHours(item.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              grid: {
                display: false,
              },
              border: {
                display: false,
              },
              ticks: {
                color: "#9fb0c8",
                font: {
                  family: "Manrope",
                  weight: "600",
                },
              },
            },
            y: {
              min: 0,
              max: this.trendChartMax,
              ticks: {
                stepSize: this.trendTickStep,
                color: "#71839e",
                font: {
                  family: "Manrope",
                  weight: "600",
                },
                callback: (value) => {
                  if (Number(value) > 24) {
                    return "";
                  }

                  if (this.trendChartMax <= 1) {
                    return `${Number(value).toFixed(2)}h`;
                  }

                  return `${value}h`;
                },
              },
              border: {
                display: false,
              },
              grid: {
                color: "rgba(132, 159, 194, 0.14)",
                drawTicks: false,
              },
            },
          },
        },
      }));
    },
  },
}).mount("#app");
