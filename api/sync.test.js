import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import syncHandler from "./sync.js";

const originalFetch = globalThis.fetch;
const originalEnv = {
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
};
let store;

function installRedisMock() {
  store = new Map();
  const counts = new Map();
  globalThis.fetch = async (_url, options) => {
    const [command, ...args] = JSON.parse(options.body);
    let result = null;
    if (command === "INCR") {
      result = (counts.get(args[0]) || 0) + 1;
      counts.set(args[0], result);
    } else if (command === "EXPIRE") {
      result = 1;
    } else if (command === "SET") {
      if (args.includes("NX") && store.has(args[0])) {
        result = null;
      } else {
        store.set(args[0], args[1]);
        result = "OK";
      }
    } else if (command === "GET") {
      result = store.get(args[0]) || null;
    } else if (command === "DEL") {
      result = store.delete(args[0]) ? 1 : 0;
    } else {
      throw new Error(`Unexpected Redis command: ${command}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ result }),
    };
  };
}

function makeResponse() {
  return {
    headers: {},
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

function makeRequest(method, extra = {}) {
  return {
    method,
    headers: { "x-forwarded-for": "203.0.113.10" },
    query: {},
    ...extra,
  };
}

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  installRedisMock();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalEnv.url;
  if (originalEnv.token === undefined)
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalEnv.token;
});

test("creates a cryptographically generated six-digit, one-time sync PIN", async () => {
  const payload = JSON.stringify({ v: 1, t: Date.now(), d: { vk_hist: [] } });
  const postResponse = makeResponse();
  await syncHandler(
    makeRequest("POST", { body: { data: payload } }),
    postResponse,
  );

  assert.equal(postResponse.statusCode, 200);
  assert.match(postResponse.body.pin, /^\d{6}$/);
  assert.equal(store.get(`sync:${postResponse.body.pin}`), payload);
  assert.equal(postResponse.headers["Cache-Control"], "no-store");

  const getResponse = makeResponse();
  await syncHandler(
    makeRequest("GET", { query: { code: postResponse.body.pin } }),
    getResponse,
  );
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.data, payload);

  const replayResponse = makeResponse();
  await syncHandler(
    makeRequest("GET", { query: { code: postResponse.body.pin } }),
    replayResponse,
  );
  assert.equal(replayResponse.statusCode, 404);
});

test("rate-limits sync code lookups per client", async () => {
  let response;
  for (let attempt = 0; attempt < 11; attempt++) {
    response = makeResponse();
    await syncHandler(
      makeRequest("GET", { query: { code: String(100000 + attempt) } }),
      response,
    );
  }
  assert.equal(response.statusCode, 429);

  const otherClient = makeResponse();
  await syncHandler(
    makeRequest("GET", {
      headers: { "x-forwarded-for": "203.0.113.11" },
      query: { code: "123456" },
    }),
    otherClient,
  );
  assert.equal(otherClient.statusCode, 404);
});

test("rejects oversized sync exports", async () => {
  const response = makeResponse();
  await syncHandler(
    makeRequest("POST", { body: { data: "x".repeat(500001) } }),
    response,
  );
  assert.equal(response.statusCode, 413);
});
