const { createApp } = Vue;

const CONNECTION_STATES = {
  ONLINE: "online",
  OFFLINE: "offline",
  UNKNOWN: "unknown",
};
const HOURS_IN_DAY = 24;
const SECONDS_IN_DAY = 24 * 60 * 60;
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

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getInitials(name) {
  const chunks = String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!chunks.length) {
    return "--";
  }

  return chunks.map((chunk) => chunk[0].toUpperCase()).join("");
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

function getStateSortRank(state) {
  switch (normalizeConnectionState(state)) {
    case CONNECTION_STATES.ONLINE:
      return 0;
    case CONNECTION_STATES.UNKNOWN:
      return 1;
    case CONNECTION_STATES.OFFLINE:
    default:
      return 2;
  }
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

function getStateBadgeClasses(state) {
  switch (normalizeConnectionState(state)) {
    case CONNECTION_STATES.ONLINE:
      return "bg-emerald-100 text-emerald-700";
    case CONNECTION_STATES.OFFLINE:
      return "bg-rose-100 text-rose-700";
    case CONNECTION_STATES.UNKNOWN:
    default:
      return "bg-amber-100 text-amber-700";
  }
}

function getStateDotClasses(state) {
  switch (normalizeConnectionState(state)) {
    case CONNECTION_STATES.ONLINE:
      return "bg-emerald-500";
    case CONNECTION_STATES.OFFLINE:
      return "bg-rose-500";
    case CONNECTION_STATES.UNKNOWN:
    default:
      return "bg-amber-400";
  }
}

function getHeroDotClasses(state) {
  switch (normalizeConnectionState(state)) {
    case CONNECTION_STATES.ONLINE:
      return "bg-emerald-300 animate-pulse";
    case CONNECTION_STATES.OFFLINE:
      return "bg-rose-300";
    case CONNECTION_STATES.UNKNOWN:
    default:
      return "bg-amber-300";
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
        isOnline:
          normalizeConnectionState(
            status?.state ?? status?.currentState ?? status?.isOnline
          ) === CONNECTION_STATES.ONLINE,
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
      selectedDevice: "",
      selectedDate: getTodayString(),
      notificationsEnabled: false,
      result: null,
      uptimeError: "",
      isBootstrapping: true,
      isLoadingUptime: false,
      isLoadingWeekly: false,
      isRefreshingDashboard: false,
      isSavingNotifications: false,
      lastUpdatedAt: null,
      refreshTimer: null,
      uptimeChart: null,
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
      return Object.entries(this.statuses)
        .map(([ip, status]) => {
          const state = normalizeConnectionState(status.state);
          const name = status.name || getDeviceName(this.devices[ip]) || ip;

          return {
            ip,
            name,
            state,
            isOnline: state === CONNECTION_STATES.ONLINE,
            stateLabel: getStateLabel(state),
            badgeClasses: getStateBadgeClasses(state),
            dotClasses: getStateDotClasses(state),
            initials: getInitials(name),
          };
        })
        .sort((left, right) => {
          if (getStateSortRank(left.state) !== getStateSortRank(right.state)) {
            return getStateSortRank(left.state) - getStateSortRank(right.state);
          }

          return left.name.localeCompare(right.name);
        });
    },

    totalDevices() {
      return this.deviceOptions.length;
    },

    onlineCount() {
      return this.deviceRows.filter(
        (device) => device.state === CONNECTION_STATES.ONLINE
      ).length;
    },

    offlineCount() {
      return this.deviceRows.filter(
        (device) => device.state === CONNECTION_STATES.OFFLINE
      ).length;
    },

    selectedDeviceLabel() {
      return (
        getDeviceName(this.devices[this.selectedDevice]) ||
        this.selectedDevice ||
        "Choose a device"
      );
    },

    selectedDeviceStatus() {
      return this.selectedDevice ? this.statuses[this.selectedDevice] || null : null;
    },

    selectedDeviceState() {
      return normalizeConnectionState(this.selectedDeviceStatus?.state);
    },

    selectedDeviceSummary() {
      if (!this.selectedDeviceStatus) {
        return "Waiting for the first status snapshot";
      }

      if (this.selectedDeviceState === CONNECTION_STATES.UNKNOWN) {
        return `${this.selectedDeviceLabel} is awaiting confirmation`;
      }

      return `${this.selectedDeviceLabel} is ${this.selectedDeviceState}`;
    },

    selectedDeviceBadgeLabel() {
      if (!this.selectedDeviceStatus) {
        return "Pending";
      }

      if (this.selectedDeviceState === CONNECTION_STATES.UNKNOWN) {
        return "Awaiting confirmation";
      }

      return `${getStateLabel(this.selectedDeviceState)} now`;
    },

    selectedDeviceBadgeClasses() {
      if (!this.selectedDeviceStatus) {
        return "bg-slate-100 text-slate-500";
      }

      return getStateBadgeClasses(this.selectedDeviceState);
    },

    selectedDeviceDotClasses() {
      if (!this.selectedDeviceStatus) {
        return "bg-slate-400";
      }

      return getStateDotClasses(this.selectedDeviceState);
    },

    selectedDeviceHeroDotClasses() {
      if (!this.selectedDeviceStatus) {
        return "bg-white/60";
      }

      return getHeroDotClasses(this.selectedDeviceState);
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

    formattedSelectedDate() {
      return formatDate(this.selectedDate, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    },

    primaryUptimeValue() {
      if (this.isLoadingUptime && !this.result) {
        return "Updating...";
      }

      return this.result?.uptime_human_readable || "--:--:--";
    },

    resultDescription() {
      if (this.result) {
        return `${this.selectedDeviceLabel} reached ${this.uptimePercentLabel} availability on ${this.formattedSelectedDate}.`;
      }

      if (this.isLoadingUptime) {
        return "Collecting the latest uptime information for the selected device.";
      }

      if (this.uptimeError) {
        return this.uptimeError;
      }

      return "Pick any monitored device to see its recorded uptime for the selected day.";
    },

    uptimePercent() {
      if (!this.result?.uptime_seconds) {
        return 0;
      }

      return clamp((this.result.uptime_seconds / SECONDS_IN_DAY) * 100, 0, 100);
    },

    uptimePercentLabel() {
      if (this.uptimePercent > 0 && this.uptimePercent < 1) {
        return "<1%";
      }

      return `${Math.round(this.uptimePercent)}%`;
    },

    uptimePercentWidth() {
      const minimumVisibleWidth = this.result ? 8 : 6;
      return `${Math.max(this.uptimePercent, minimumVisibleWidth)}%`;
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

      await Promise.all([this.fetchUptime(), this.fetchWeeklyUptime()]);
    },

    async selectedDate(newValue, oldValue) {
      if (!newValue || this.isBootstrapping || newValue === oldValue) {
        return;
      }

      await this.fetchUptime();
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
          this.loadNotificationSetting(),
          this.fetchCurrentStatus(),
        ]);

        if (this.selectedDevice) {
          await Promise.all([this.fetchUptime(), this.fetchWeeklyUptime()]);
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

    async fetchUptime() {
      if (!this.selectedDevice || !this.selectedDate) {
        this.result = null;
        this.uptimeError = "Choose both a device and a date.";
        return;
      }

      this.isLoadingUptime = true;

      try {
        const response = await fetch(
          `/uptime/${this.selectedDevice}/${this.selectedDate}`
        );
        if (!response.ok) {
          throw new Error("Failed to load uptime.");
        }

        const data = await response.json();
        if (data.error) {
          this.result = null;
          this.uptimeError = data.error;
          return;
        }

        this.result = {
          ...data,
          device: getDeviceName(data.device) || this.devices[this.selectedDevice] || this.selectedDevice,
        };
        this.uptimeError = "";
      } catch (error) {
        console.error("Error fetching uptime:", error);
        this.result = null;
        this.uptimeError = "An error occurred while fetching the uptime.";
      } finally {
        this.isLoadingUptime = false;
      }
    },

    async fetchWeeklyUptime() {
      if (!this.selectedDevice) {
        this.weeklyUptime = [];
        this.renderChart();
        return;
      }

      this.isLoadingWeekly = true;

      try {
        const response = await fetch(`/weekly/${this.selectedDevice}`);
        if (!response.ok) {
          throw new Error("Failed to load weekly uptime.");
        }

        const data = await response.json();
        this.weeklyUptime = Array.isArray(data) ? data : [];
        this.$nextTick(() => this.renderChart());
      } catch (error) {
        console.error("Error fetching weekly uptime:", error);
        this.weeklyUptime = [];
        this.$nextTick(() => this.renderChart());
      } finally {
        this.isLoadingWeekly = false;
      }
    },

    async loadNotificationSetting() {
      try {
        const response = await fetch("/notifications");
        if (!response.ok) {
          throw new Error("Failed to load notification settings.");
        }

        const data = await response.json();
        this.notificationsEnabled = Boolean(data.enabled);
      } catch (error) {
        console.error("Error loading notification setting:", error);
        this.notificationsEnabled = false;
      }
    },

    async toggleNotifications() {
      if (this.isSavingNotifications) {
        return;
      }

      const previousValue = this.notificationsEnabled;
      const nextValue = !previousValue;
      this.notificationsEnabled = nextValue;
      this.isSavingNotifications = true;

      try {
        const response = await fetch("/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: nextValue }),
        });

        if (!response.ok) {
          throw new Error("Failed to update notifications.");
        }

        const data = await response.json();
        this.notificationsEnabled = Boolean(data.enabled);
      } catch (error) {
        console.error("Error updating notification setting:", error);
        this.notificationsEnabled = previousValue;
      } finally {
        this.isSavingNotifications = false;
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
          this.fetchUptime(),
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

    renderChart() {
      const canvas = this.$refs.uptimeChart;
      if (!canvas) {
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      if (this.uptimeChart) {
        this.uptimeChart.destroy();
      }

      const gradient = context.createLinearGradient(0, 0, 0, canvas.height || 320);
      gradient.addColorStop(0, "rgba(20, 144, 122, 0.95)");
      gradient.addColorStop(1, "rgba(15, 118, 110, 0.35)");

      const labels = this.weeklyUptime.map((entry) =>
        this.formatChartLabel(entry.date)
      );
      const values = this.weeklyUptime.map((entry) => Number(entry.uptime || 0));

      this.uptimeChart = new Chart(context, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Uptime (hours)",
              data: values,
              backgroundColor: gradient,
              borderRadius: 999,
              borderSkipped: false,
              maxBarThickness: 28,
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
              backgroundColor: "#0f172a",
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
                color: "#64748b",
                font: {
                  family: "Manrope",
                  weight: "600",
                },
              },
            },
            y: {
              min: 0,
              max: HOURS_IN_DAY,
              ticks: {
                stepSize: 6,
                color: "#94a3b8",
                font: {
                  family: "Manrope",
                  weight: "600",
                },
                callback: (value) => `${value}h`,
              },
              border: {
                display: false,
              },
              grid: {
                color: "rgba(148, 163, 184, 0.15)",
                drawTicks: false,
              },
            },
          },
        },
      });
    },
  },
}).mount("#app");
