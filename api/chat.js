import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/llm", async (req, res) => {
  try {
    const { system, messages, maxTokens } = req.body;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: [
          { role: "system", content: system },
          ...(messages || []),
        ],
        max_output_tokens: maxTokens ?? 2000,
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: JSON.stringify(data) });
    }

    const text =
      data.output?.find((x) => x.type === "message")
        ?.content?.find((c) => c.type === "output_text")?.text
      ?? data.output_text
      ?? "";

    return res.json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


// 포트를 Render가 주는 환경 변수로 유연하게 받습니다.
const PORT = process.env.PORT || 8787; 

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
});