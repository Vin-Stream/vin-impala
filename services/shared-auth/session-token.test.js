import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeSession,
  createSessionToken,
  ImpalaAuthError,
  verifySessionToken
} from "./session-token.js";

const secret = "test-secret";
const expiresAt = "2099-01-01T00:00:00.000Z";

test("creates and verifies the existing Impala token format", () => {
  const token = createSessionToken({ username: "Kevin", expiresAt }, secret);
  const payload = verifySessionToken(token, secret);
  assert.equal(payload.username, "kevin");
  assert.equal(payload.expiresAt, expiresAt);
});

test("accepts canonical sub and exp claims", () => {
  const token = createSessionToken({ sub: "Kevin", exp: expiresAt, roles: ["viewer"] }, secret);
  const payload = verifySessionToken(token, secret);
  assert.equal(payload.username, "kevin");
  assert.equal(payload.expiresAt, expiresAt);
});

test("rejects malformed, invalid, and expired tokens uniformly", () => {
  for (const token of [
    "malformed",
    `${Buffer.from("{}").toString("base64url")}.invalid`,
    createSessionToken({ username: "kevin", expiresAt: "2020-01-01T00:00:00.000Z" }, secret)
  ]) {
    assert.throws(
      () => verifySessionToken(token, secret),
      (error) => error instanceof ImpalaAuthError
        && error.statusCode === 401
        && error.publicMessage === "Invalid session."
    );
  }
});

test("requires a valid token user to remain on the active allow-list", () => {
  const token = createSessionToken({ username: "Kevin", expiresAt }, secret);
  const authorized = authorizeSession({
    authorization: `Bearer ${token}`,
    sessionSecret: secret,
    users: [{ username: "kevin", isAdmin: false }]
  });
  assert.equal(authorized.username, "kevin");

  assert.throws(
    () => authorizeSession({
      authorization: `Bearer ${token}`,
      sessionSecret: secret,
      users: []
    }),
    (error) => error instanceof ImpalaAuthError
      && error.statusCode === 403
      && error.publicMessage === "User is not authorized."
  );
});
