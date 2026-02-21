export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { system, messages, maxTokens } = req.body;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens ?? 2000,
        system,
        messages,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: JSON.stringify(data) });
    return res.json({ text: data.content[0].text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
