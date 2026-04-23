export default async function handler(req, res) {
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
    return r.json();
  }

  if (req.method === "POST") {
    const { data } = req.body;
    if (!data || typeof data !== "string") {
      return res.status(400).json({ error: "Missing data" });
    }
    if (data.length > 500000) {
      return res.status(413).json({ error: "Data too large" });
    }

    let pin;
    let attempts = 0;
    do {
      pin = String(Math.floor(100000 + Math.random() * 900000));
      const exists = await redis(["EXISTS", `sync:${pin}`]);
      if (exists.result === 0) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return res
        .status(503)
        .json({ error: "Could not generate PIN, try again" });
    }

    await redis(["SET", `sync:${pin}`, data, "EX", 600]);

    return res.status(200).json({ pin });
  }

  if (req.method === "GET") {
    const { code } = req.query;
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Invalid code" });
    }

    const result = await redis(["GET", `sync:${code}`]);
    if (!result.result) {
      return res.status(404).json({ error: "Code not found or expired" });
    }

    await redis(["DEL", `sync:${code}`]);

    return res.status(200).json({ data: result.result });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
