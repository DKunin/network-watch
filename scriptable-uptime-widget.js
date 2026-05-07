// Scriptable iOS widget for Network Watch uptime.
// Install this file in Scriptable and use it as a widget script.
// Optional widget parameter: device IP, for example `192.168.28.230`.

const BASE_URL = "http://62.217.190.139:3031";
const DEFAULT_DEVICE_IP = "192.168.28.230";
const COOKIE_HEADER =
  "authToken=c3e0713acf247637fe102131e88874c2b447bdc73efc0071f5583ad01c0a89ce; mai_file_api_session=bdf0adca-092f-45ae-9e40-0e26943717e2; ktalk_app_session=1ee1f8927fd364b671d437f64685f48fb4c30874c4bd9df9";
const REQUEST_TIMEOUT_SECONDS = 15;
const AUTO_REFRESH_MINUTES = 5;
const DEFAULT_LOCALE = "en-US";

const deviceIp = getDeviceIp();
const today = formatToday(new Date());
const widget = await createWidget(deviceIp, today);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}

Script.complete();

function getDeviceIp() {
  const fromWidget = String(args.widgetParameter || "").trim();
  const fromQuery = String((args.queryParameters && args.queryParameters.ip) || "").trim();
  return fromWidget || fromQuery || DEFAULT_DEVICE_IP;
}

function formatToday(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildRefreshUrl(ip) {
  const scriptName = encodeURIComponent(Script.name());
  const encodedIp = encodeURIComponent(ip);
  return `scriptable:///run?scriptName=${scriptName}&ip=${encodedIp}`;
}

async function fetchUptime(ip, dateString) {
  const url = `${BASE_URL}/uptime/${encodeURIComponent(ip)}/${dateString}`;
  const request = new Request(url);

  request.method = "GET";
  request.timeoutInterval = REQUEST_TIMEOUT_SECONDS;
  request.headers = {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
    Connection: "keep-alive",
    Cookie: COOKIE_HEADER,
    DNT: "1",
    Referer: `${BASE_URL}/`,
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Scriptable",
  };

  const response = await request.loadJSON();
  if (response.error) {
    throw new Error(response.error);
  }

  if (typeof response.uptime_human_readable !== "string") {
    throw new Error("uptime_human_readable is missing in the response.");
  }

  return response;
}

async function createWidget(ip, dateString) {
  const list = new ListWidget();
  list.setPadding(16, 16, 14, 16);
  list.backgroundColor = new Color("#10131a");
  list.refreshAfterDate = new Date(Date.now() + AUTO_REFRESH_MINUTES * 60 * 1000);
  list.url = `${BASE_URL}/`;

  const refreshUrl = buildRefreshUrl(ip);

  const header = list.addStack();
  header.centerAlignContent();

  const title = header.addText("Network Watch");
  title.font = Font.semiboldSystemFont(12);
  title.textColor = new Color("#f8fafc");

  header.addSpacer();

  const refreshStack = header.addStack();
  refreshStack.url = refreshUrl;
  refreshStack.centerAlignContent();
  refreshStack.setPadding(4, 4, 4, 4);

  const refreshIcon = refreshStack.addImage(SFSymbol.named("arrow.clockwise").image);
  refreshIcon.imageSize = new Size(13, 13);
  refreshIcon.tintColor = new Color("#60a5fa");

  list.addSpacer(10);

  const label = list.addText(ip);
  label.font = Font.mediumSystemFont(11);
  label.textColor = new Color("#94a3b8");
  label.lineLimit = 1;

  list.addSpacer(6);

  try {
    const data = await fetchUptime(ip, dateString);
    const uptime = list.addText(data.uptime_human_readable);
    uptime.font = Font.boldRoundedSystemFont(28);
    uptime.textColor = new Color("#ffffff");
    uptime.minimumScaleFactor = 0.7;
    uptime.lineLimit = 1;

    list.addSpacer(8);

    const meta = list.addText(`${data.device} • ${formatDisplayDate(data.date)}`);
    meta.font = Font.mediumSystemFont(11);
    meta.textColor = new Color("#cbd5e1");
    meta.lineLimit = 2;

    list.addSpacer(6);

    const footer = list.addStack();
    footer.centerAlignContent();

    const statusDot = footer.addText("●");
    statusDot.font = Font.systemFont(10);
    statusDot.textColor = new Color("#22c55e");

    footer.addSpacer(6);

    const statusText = footer.addText(
      `Updated ${formatTime(new Date())} • Tap refresh`
    );
    statusText.font = Font.mediumSystemFont(10);
    statusText.textColor = new Color("#94a3b8");
    statusText.lineLimit = 1;
  } catch (error) {
    const errorTitle = list.addText("Request failed");
    errorTitle.font = Font.semiboldSystemFont(16);
    errorTitle.textColor = new Color("#fda4af");

    list.addSpacer(6);

    const errorText = list.addText(String(error.message || error));
    errorText.font = Font.mediumSystemFont(11);
    errorText.textColor = new Color("#fecdd3");
    errorText.lineLimit = 4;

    list.addSpacer(8);

    const retryHint = list.addText("Tap the refresh icon to run the script again.");
    retryHint.font = Font.mediumSystemFont(10);
    retryHint.textColor = new Color("#94a3b8");
    retryHint.lineLimit = 3;
  }

  return list;
}

function formatDisplayDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
