"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const config = require("../src/config");
const { readProxyIdentity, requireProxyIdentity } = require("../src/auth");

function requestWith(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  );

  return {
    get(name) {
      return normalized[name.toLowerCase()];
    },
  };
}

test("backend binds to loopback", () => {
  assert.equal(config.HOST, "127.0.0.1");
});

test("proxy identity requires both user headers and parses roles", () => {
  assert.equal(readProxyIdentity(requestWith({ "X-Auth-User": "owner" })), null);

  assert.deepEqual(
    readProxyIdentity(
      requestWith({
        "X-Auth-User": " owner ",
        "X-Auth-User-Id": " user-1 ",
        "X-Auth-Roles": "member, admin",
      })
    ),
    { username: "owner", userId: "user-1", roles: ["member", "admin"] }
  );
});

test("proxy middleware rejects missing identity", () => {
  let statusCode;
  let payload;
  const response = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };

  requireProxyIdentity(requestWith(), response, () => {
    assert.fail("middleware must not continue without an identity");
  });

  assert.equal(statusCode, 401);
  assert.deepEqual(payload, { error: "Authentication required." });
});

test("nginx verifies sessions and sanitizes external identity headers", () => {
  const nginx = fs.readFileSync("ops/nginx/network.kunini.ru.conf", "utf8");

  assert.match(nginx, /server_name network\.kunini\.ru;/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3030\/verify;/);
  assert.match(nginx, /location \/api\/ \{[\s\S]*error_page 401 = @kunini_api_unauthorized;/);
  assert.match(nginx, /location \/ \{[\s\S]*error_page 401 = @kunini_login;/);
  assert.match(nginx, /proxy_set_header X-Auth-User "";/);
  assert.match(nginx, /proxy_set_header X-Auth-User \$kunini_user;/);
  assert.match(nginx, /proxy_set_header Cookie "";/);
});
