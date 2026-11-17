import { createHash, randomInt } from "node:crypto";

const PIN_TTL_SECONDS = 600;
const IMPORT_LIMIT = 10;
const IMPORT_WINDOW_SECONDS = 600;
const EXPORT_LIMIT = 10;
const EXPORT_WINDOW_SECONDS = 3600;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ error: "Sync not configured" });
  }

  async function redis(cmd) {
    const r = await fetch(`${UPSTASH_URL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });
    if (!r.ok) throw new Error(`Redis request failed (${r.status})`);
    const result = await r.json();
    if (result.error) throw new Error("Redis command failed");
    return result;
  }

  try {
    if (req.method === "POST") {
      if (
        !(await allowRequest(
          req,
          redis,
          "export",
          EXPORT_LIMIT,
          EXPORT_WINDOW_SECONDS,
        ))
      ) {
        return res
          .status(429)
          .json({ error: "Too many sync requests. Try again later." });
      }

      const data = req.body && req.body.data;
      if (typeof data !== "string" || !data) {
        return res.status(400).json({ error: "Missing data" });
      }
      if (Buffer.byteLength(data, "utf8") > 500000) {
        return res.status(413).json({ error: "Data too large" });
      }

      for (let attempt = 0; attempt < 10; attempt++) {
        const pin = String(randomInt(100000, 1000000));
        const stored = await redis([
          "SET",
          `sync:${pin}`,
          data,
          "EX",
          PIN_TTL_SECONDS,
          "NX",
        ]);
        if (stored.result === "OK") return res.status(200).json({ pin });
      }
      return res
        .status(503)
        .json({ error: "Could not generate PIN, try again" });
    }

    if (
      !(await allowRequest(
        req,
        redis,
        "import",
        IMPORT_LIMIT,
        IMPORT_WINDOW_SECONDS,
      ))
    ) {
      return res
        .status(429)
        .json({ error: "Too many sync attempts. Try again later." });
    }

    const code = req.query && req.query.code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Invalid code" });
    }

    const result = await redis(["GET", `sync:${code}`]);
    if (typeof result.result !== "string") {
      return res.status(404).json({ error: "Code not found or expired" });
    }

    await redis(["DEL", `sync:${code}`]);
    return res.status(200).json({ data: result.result });
  } catch (err) {
    console.error("Sync API error:", err);
    return res.status(503).json({ error: "Sync temporarily unavailable" });
  }
}

async function allowRequest(req, redis, action, limit, windowSeconds) {
  const forwarded = req.headers && req.headers["x-forwarded-for"];
  const forwardedAddresses = Array.isArray(forwarded)
    ? forwarded
    : typeof forwarded === "string"
      ? forwarded.split(",")
      : [];
  const address =
    forwardedAddresses.length > 0
      ? forwardedAddresses[forwardedAddresses.length - 1].trim()
      : (req.socket && req.socket.remoteAddress) || "unknown";
  const addressHash = createHash("sha256")
    .update(address)
    .digest("hex")
    .slice(0, 32);
  const key = `sync:rate:${action}:${addressHash}`;
  const count = await redis(["INCR", key]);
  const requests = Number(count.result);
  if (!Number.isSafeInteger(requests)) throw new Error("Invalid rate limit state");
  if (requests === 1) await redis(["EXPIRE", key, windowSeconds]);
  return requests <= limit;
}
// sync
