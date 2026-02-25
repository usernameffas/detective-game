export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { system, messages, maxTokens = 1500 } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: "OPENAI_API_KEY is not set" });
      return;
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini", // 비교적 빠른 모델
        max_tokens: maxTokens,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          ...(messages || []),
        ],
      }),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      res.status(openaiRes.status).json({ error: JSON.stringify(data) });
      return;
    }

    if (data.error) {
      res.status(500).json({ error: data.error.message || "OpenAI error" });
      return;
    }

    const text = data.choices?.[0]?.message?.content || "";
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
}
