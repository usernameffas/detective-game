export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { system, messages, maxTokens } = req.body;
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [
          { role: "system", content: system },
          ...(messages || []),
        ],
        max_output_tokens: maxTokens ?? 2000,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: JSON.stringify(data) });
    const text = data.output?.find(x => x.type === "message")
      ?.content?.find(c => c.type === "output_text")?.text ?? "";
    return res.json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
