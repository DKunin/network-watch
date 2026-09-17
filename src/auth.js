"use strict";

function readProxyIdentity(request) {
  const username = request.get("X-Auth-User")?.trim();
  const userId = request.get("X-Auth-User-Id")?.trim();

  if (!username || !userId) {
    return null;
  }

  return {
    username,
    userId,
    roles: String(request.get("X-Auth-Roles") || "")
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean),
  };
}

function requireProxyIdentity(request, response, next) {
  const identity = readProxyIdentity(request);

  if (!identity) {
    return response.status(401).json({ error: "Authentication required." });
  }

  request.auth = identity;
  return next();
}

module.exports = { readProxyIdentity, requireProxyIdentity };
