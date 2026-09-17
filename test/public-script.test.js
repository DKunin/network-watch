"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function loadDashboardScript() {
  let component;
  const context = {
    Vue: {
      createApp(options) {
        component = options;
        return { mount() {} };
      },
      markRaw(value) {
        return value;
      },
    },
    Chart: function Chart() {},
    Date,
    Intl,
    URL,
    console,
    fetch() {},
    window: {
      clearInterval() {},
      location: {
        assign() {},
        href: "https://network.kunini.ru/",
      },
      setInterval() {},
    },
  };

  vm.runInNewContext(
    fs.readFileSync("public/script.js", "utf8"),
    context,
    { filename: "public/script.js" }
  );

  return { component, context };
}

test("date navigation crosses calendar boundaries", () => {
  const { context } = loadDashboardScript();

  assert.equal(context.shiftDateString("2026-09-14", -1), "2026-09-13");
  assert.equal(context.shiftDateString("2026-09-30", 1), "2026-10-01");
  assert.equal(context.shiftDateString("2024-02-28", 1), "2024-02-29");
  assert.equal(context.shiftDateString("2026-01-01", -1), "2025-12-31");
});

test("date navigation ignores an invalid selected date", () => {
  const { component, context } = loadDashboardScript();
  const state = { selectedDate: "2026-02-29" };

  assert.equal(context.shiftDateString(state.selectedDate, 1), "");
  component.methods.changeSelectedDate.call(state, 1);
  assert.equal(state.selectedDate, "2026-02-29");
});

test("date navigation method updates the selected date", () => {
  const { component } = loadDashboardScript();
  const state = { selectedDate: "2026-09-14" };

  component.methods.changeSelectedDate.call(state, -1);
  assert.equal(state.selectedDate, "2026-09-13");
});

test("authenticated fetch uses the API prefix", async () => {
  const { context } = loadDashboardScript();
  let requestedPath;
  context.fetch = async (path) => {
    requestedPath = path;
    return { status: 200 };
  };

  await context.authenticatedFetch("/devices");

  assert.equal(requestedPath, "/api/devices");
});

test("authenticated fetch redirects expired sessions to Kunini Auth", async () => {
  const { context } = loadDashboardScript();
  let redirectURL;
  context.fetch = async () => ({ status: 401 });
  context.window.location.assign = (value) => {
    redirectURL = String(value);
  };

  await assert.rejects(context.authenticatedFetch("/status"), /Authentication required/);

  const parsed = new URL(redirectURL);
  assert.equal(parsed.origin, "https://auth.kunini.ru");
  assert.equal(parsed.pathname, "/login");
  assert.equal(parsed.searchParams.get("return_to"), "https://network.kunini.ru/");
});
