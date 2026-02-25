const callClaude = async (system, messages, maxTokens = 1500) => {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, maxTokens }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  if (data.error) throw new Error(data.error);

  return data.text; // 백엔드가 { text: "..."}로 줄 예정
};

const safeParseJSON = (raw) => {
  let t = raw.trim().replace(/```json/g, "").replace(/```/g, "");
  t = t.replace(/\r\n/g, " ").replace(/\n/g, " ").replace(/\r/g, " ");
  const m = t.match(/\{[\s\S]*\}/);
  if (m) t = m[0];
  return JSON.parse(t);
};

const PHASE = { TITLE: 0, LOADING: 1, INTRO: 2, INTERROGATE: 3, ACCUSE: 4, RESULT: 5 };

const DUMMY = {
  case_title: "저택의 밀실 살인",
  case_description: "빅토리아 시대 저택에서 주인 에드워드 경이 서재에서 독살된 채 발견되었습니다.",
  location: "런던 근교 블랙우드 저택",
  time_of_death: "오후 10시 ~ 11시 사이",
  culprit: "박교수",
  motive: "에드워드 경이 박교수의 학문적 표절을 폭로하려 했습니다.",
  suspects: {
    "박교수": {
      personality: "냉철하고 논리적이지만 오만함",
      alibi: "오후 10시부터 응접실에서 혼자 책을 읽었다고 주장하지만 목격자가 없음",
      secret: "피해자의 원고를 몰래 자신의 이름으로 발표했음",
      is_culprit: true
    },
    "최부인": {
      personality: "우아하지만 신경질적",
      alibi: "오후 9시 30분부터 11시까지 음악실에서 김청년과 함께 있었음 (서로 증언 일치)",
      secret: "에드워드 경과 오래된 로맨스가 있었음",
      is_culprit: false
    },
    "김청년": {
      personality: "젊고 충동적",
      alibi: "오후 9시 30분부터 11시까지 음악실에서 최부인과 함께 있었음 (서로 증언 일치)",
      secret: "도박 빚 때문에 에드워드 경에게 돈을 빌리려 했음",
      is_culprit: false
    },
  },
  clues: [
    "📄 서재 벽난로 재 속에서 반쯤 탄 편지가 발견됨. '...당신의 죄를 세상에 알리겠소. 내일까지 자백하지 않으면...' 이라는 문구가 읽힘.",
    "🍷 피해자의 와인잔에서 독성 물질이 검출됨. 와인은 저녁 식사 후 각자 방으로 가져간 것으로, 누군가 오후 10시 이후 서재에 들어가 와인에 독을 탔을 가능성이 높음.",
    "👞 서재 입구 카펫에서 진흙 묻은 발자국 발견. 저녁 8시 이후 비가 내렸고, 정원을 지나야만 진흙이 묻을 수 있는 구조임.",
  ],
};

export default function App() {
  const [phase, setPhase] = useState(PHASE.TITLE);
  const [scenario, setScenario] = useState(null);
  const [selectedSuspect, setSelectedSuspect] = useState(null);
  const [histories, setHistories] = useState({});
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showCase, setShowCase] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [histories, isThinking]);

  const loadScenario = (sc) => {
    const h = {};
    Object.keys(sc.suspects).forEach(n => h[n] = []);
    setScenario(sc); setHistories(h);
    setSelectedSuspect(Object.keys(sc.suspects)[0]);
    setPhase(PHASE.INTRO);
  };

  const startGame = async () => {
    setError(null); setPhase(PHASE.LOADING);
    try {
      const raw = await callClaude(
        "You are a JSON generator. Output ONLY a valid JSON object. No markdown, no line breaks inside string values.",
        [{
          role: "user",
          content: `Create a Korean murder mystery game scenario as JSON. All string values must be single-line. Output ONLY the JSON:

{"case_title":"제목","case_description":"짧은설명","location":"장소","time_of_death":"오후 10시~11시 사이","culprit":"범인이름","motive":"범행동기","suspects":{"이름1":{"personality":"성격","alibi":"사망시간대 구체적 알리바이 (목격자 있음)","secret":"숨기는비밀","is_culprit":false},"이름2":{"personality":"성격","alibi":"사망시간대 구체적 알리바이 (목격자 있음)","secret":"숨기는비밀","is_culprit":false},"이름3":{"personality":"성격","alibi":"사망시간대 알리바이 (목격자 없음, 허점 있음)","secret":"범행관련비밀","is_culprit":true}},"clues":["물증1: 구체적 물증","물증2: 사망시간대 관련 단서","물증3: 범행 동기를 암시하는 단서"]}

RULES:
- suspects 키에 실제 이름 사용 (용의자A/B/C 금지)
- culprit은 세 용의자 중 랜덤으로 선택. 항상 마지막이 범인이면 안됨
- 범인만 목격자 없는 알리바이
- clues는 간접적으로 - 범인 이름 절대 포함 금지`
        }]
      );
      loadScenario(safeParseJSON(raw));
    } catch (e) { setError(e.message); setPhase(PHASE.TITLE); }
  };

  const sendMessage = async () => {
    if (!input.trim() || isThinking || !selectedSuspect) return;
    const msg = input.trim();
    setInput(""); setIsThinking(true);
    const suspect = scenario.suspects[selectedSuspect];
    const suspectNames = Object.keys(scenario.suspects).join(", ");
    try {
      const reply = await callClaude(
        `당신은 추리 게임 용의자 ${selectedSuspect}입니다.
사건: ${scenario.case_description}
사망 추정 시간: ${scenario.time_of_death}
등장인물은 오직 이 세 명뿐: ${suspectNames}
성격: ${suspect.personality}
알리바이: ${suspect.alibi}
숨기는 비밀: ${suspect.secret}
${suspect.is_culprit
  ? `당신이 범인입니다. 알리바이를 일관되게 주장하되 작은 모순을 남기세요. 다른 용의자에게 의심을 돌리세요.`
  : `당신은 범인이 아닙니다. 알리바이를 당당하게 주장하세요. 비밀은 들키기 싫어서 긴장하세요.`}
등장인물 외 인물 절대 언급 금지. 2~3문장으로 한국어로 자연스럽게 대답하세요.`,
        [...histories[selectedSuspect], { role: "user", content: msg }]
      );
      setHistories(prev => ({
        ...prev,
        [selectedSuspect]: [...prev[selectedSuspect], { role: "user", content: msg }, { role: "assistant", content: reply }]
      }));
    } catch (e) { setError(e.message); }
    setIsThinking(false);
  };

  const accuse = (name) => { setResult({ correct: name === scenario.culprit, name }); setPhase(PHASE.RESULT); };
  const reset = () => { setScenario(null); setResult(null); setHistories({}); setSelectedSuspect(null); setError(null); setShowCase(false); setPhase(PHASE.TITLE); };
  const suspects = scenario ? Object.keys(scenario.suspects) : [];

  const S = {
    root: { minHeight: "100vh", background: "#0d0a07", color: "#e8d5b0", fontFamily: "Georgia, serif", padding: "20px 16px" },
    wrap: { maxWidth: 680, margin: "0 auto" },
    card: { background: "#130e09", border: "1px solid #3a2a15", borderRadius: 4, padding: 20, marginBottom: 14 },
    lbl: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#8b6a2f", marginBottom: 10, fontFamily: "monospace" },
    btn: { background: "rgba(139,90,43,0.3)", border: "1px solid #8b6a2f", color: "#e8d5b0", padding: "10px 22px", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 14, borderRadius: 3 },
    btnBig: { background: "rgba(139,90,43,0.4)", border: "2px solid #8b6a2f", color: "#e8d5b0", padding: "13px 44px", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 15, borderRadius: 3, display: "block", margin: "0 auto" },
    btnGray: { background: "rgba(80,80,80,0.3)", border: "1px solid #555", color: "#aaa", padding: "10px 22px", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 13, borderRadius: 3 },
    btnRed: { background: "rgba(160,60,60,0.2)", border: "1px solid #a03c3c", color: "#e08080", padding: "10px 22px", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 14, borderRadius: 3 },
    input: { flex: 1, background: "#0a0704", border: "1px solid #3a2a15", color: "#e8d5b0", padding: "9px 12px", fontFamily: "Georgia, serif", fontSize: 14, outline: "none", borderRadius: 3 },
    sb: (a) => ({ background: a ? "rgba(139,90,43,0.35)" : "rgba(139,90,43,0.1)", border: `1px solid ${a ? "#8b6a2f" : "#3a2a15"}`, color: "#e8d5b0", padding: "8px 14px", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 13, borderRadius: 3, marginRight: 8, marginBottom: 8 }),
  };

  return (
    <div style={S.root}><div style={S.wrap}>
      <h1 style={{ fontSize: 24, textAlign: "center", color: "#e8d5b0", marginBottom: 4 }}>🕵️ 셜록홈즈 추리 게임</h1>
      <p style={{ textAlign: "center", color: "#8b7355", fontSize: 13, marginBottom: 24, fontStyle: "italic" }}>범인을 밝혀내세요</p>

      {error && <div style={{ background: "#2a0a0a", border: "1px solid #a00", color: "#f99", padding: 12, borderRadius: 4, marginBottom: 14, fontSize: 12 }}><b>오류:</b> {error}<button onClick={() => setError(null)} style={{ marginLeft: 10, background: "none", border: "none", color: "#f99", cursor: "pointer" }}>✕</button></div>}

      {phase === PHASE.TITLE && (
        <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>🔍</div>
          <div style={{ color: "#c4a96e", marginBottom: 10, fontSize: 16 }}>새로운 사건이 당신을 기다립니다</div>
          <div style={{ color: "#8b7355", fontSize: 13, marginBottom: 28, lineHeight: 1.7 }}>AI가 매번 새로운 시나리오를 생성합니다<br />용의자를 심문하고 범인을 찾아내세요</div>
          <button style={S.btnBig} onClick={startGame}>🎲 AI 시나리오로 시작</button>
          <div style={{ marginTop: 14 }}><button style={S.btnGray} onClick={() => loadScenario(DUMMY)}>🗒️ 샘플 시나리오로 시작</button></div>
        </div>
      )}

      {phase === PHASE.LOADING && (
        <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
          <div style={{ color: "#8b6a2f", fontSize: 15, marginBottom: 8 }}>⏳ 시나리오 생성 중...</div>
          <div style={{ color: "#5a4a35", fontSize: 12 }}>10~20초 정도 걸릴 수 있습니다</div>
        </div>
      )}

      {phase === PHASE.INTRO && scenario && (
        <>
          <div style={S.card}>
            <div style={S.lbl}>사건명</div>
            <div style={{ fontSize: 20, color: "#e8d5b0", marginBottom: 8, fontStyle: "italic" }}>{scenario.case_title}</div>
            <div style={{ color: "#b09870", lineHeight: 1.8, fontSize: 14, marginBottom: 8 }}>{scenario.case_description}</div>
            <div style={{ color: "#c4906a", fontSize: 13, marginBottom: 4 }}>⏰ 사망 추정 시간: <b>{scenario.time_of_death}</b></div>
            <div style={{ color: "#5a4a35", fontSize: 12 }}>📍 {scenario.location}</div>
          </div>
          <div style={S.card}>
            <div style={S.lbl}>물증 및 단서</div>
            {scenario.clues.map((c, i) => <div key={i} style={{ color: "#c4a96e", fontSize: 14, marginBottom: 10, lineHeight: 1.7, paddingLeft: 10, borderLeft: "2px solid #3a2a15" }}>{c}</div>)}
          </div>
          <div style={S.card}>
            <div style={S.lbl}>용의자</div>
            <div style={{ color: "#c4a96e", fontSize: 14 }}>{suspects.join(" · ")}</div>
          </div>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <button style={S.btnBig} onClick={() => setPhase(PHASE.INTERROGATE)}>심문 시작 →</button>
          </div>
        </>
      )}

      {phase === PHASE.INTERROGATE && scenario && (
        <>
          {/* 사건 정보 접기 패널 */}
          <div style={{ background: "#130e09", border: "1px solid #3a2a15", borderRadius: 4, marginBottom: 14, overflow: "hidden" }}>
            <button onClick={() => setShowCase(o => !o)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "#8b6a2f", padding: "12px 20px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📋 사건 정보 보기</span><span>{showCase ? "▲" : "▼"}</span>
            </button>
            {showCase && (
              <div style={{ padding: "0 20px 16px", borderTop: "1px solid #3a2a15" }}>
                <div style={{ fontStyle: "italic", fontSize: 18, color: "#e8d5b0", margin: "12px 0 6px" }}>{scenario.case_title}</div>
                <div style={{ color: "#b09870", fontSize: 13, lineHeight: 1.8, marginBottom: 6 }}>{scenario.case_description}</div>
                <div style={{ color: "#c4906a", fontSize: 12, marginBottom: 10 }}>⏰ 사망 추정 시간: <b>{scenario.time_of_death}</b></div>
                <div style={{ color: "#5a4a35", fontSize: 11, marginBottom: 12 }}>📍 {scenario.location}</div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#8b6a2f", marginBottom: 8, fontFamily: "monospace", textTransform: "uppercase" }}>물증 및 단서</div>
                {scenario.clues.map((c, i) => <div key={i} style={{ color: "#c4a96e", fontSize: 13, marginBottom: 10, lineHeight: 1.7, paddingLeft: 8, borderLeft: "2px solid #3a2a15" }}>{c}</div>)}
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#8b6a2f", margin: "12px 0 8px", fontFamily: "monospace", textTransform: "uppercase" }}>용의자</div>
                <div style={{ color: "#c4a96e", fontSize: 13 }}>{suspects.join(" · ")}</div>
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={S.lbl}>용의자 선택</div>
            <div>{suspects.map(n => (
              <button key={n} style={S.sb(selectedSuspect === n)} onClick={() => setSelectedSuspect(n)}>
                {n}{histories[n]?.length > 0 ? ` (${histories[n].length / 2})` : ""}
              </button>
            ))}</div>
          </div>

          {selectedSuspect && (
            <div style={S.card}>
              <div style={S.lbl}>심문 중: {selectedSuspect}</div>
              <div style={{ minHeight: 180, maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
                {histories[selectedSuspect].length === 0 && <div style={{ color: "#5a4a35", fontStyle: "italic", fontSize: 13 }}>질문을 입력하세요...</div>}
                {histories[selectedSuspect].map((m, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: m.role === "user" ? "#5a8a6a" : "#8b6a2f", marginBottom: 3, letterSpacing: 1 }}>{m.role === "user" ? "탐정" : selectedSuspect}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.7, padding: "8px 12px", borderLeft: `2px solid ${m.role === "user" ? "#5a8a6a" : "#8b6a2f"}`, color: m.role === "user" ? "#a8c8b0" : "#c4a96e" }}>{m.content}</div>
                  </div>
                ))}
                {isThinking && <div style={{ color: "#8b6a2f", fontStyle: "italic", fontSize: 12 }}>답변 중...</div>}
                <div ref={chatEndRef} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={S.input} placeholder="질문을 입력하세요 (Enter)" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} disabled={isThinking} />
                <button style={S.btn} onClick={sendMessage} disabled={isThinking || !input.trim()}>질문</button>
              </div>
            </div>
          )}

          <div style={{ textAlign: "center" }}>
            <button style={S.btnRed} onClick={() => setPhase(PHASE.ACCUSE)}>🎯 범인 지목하기</button>
          </div>
        </>
      )}

      {phase === PHASE.ACCUSE && scenario && (
        <div style={S.card}>
          <div style={S.lbl}>최종 지목</div>
          <div style={{ color: "#8b7355", fontSize: 13, marginBottom: 14, fontStyle: "italic" }}>범인이라고 생각하는 사람을 선택하세요</div>
          {suspects.map(n => (
            <button key={n} onClick={() => accuse(n)} style={{ display: "block", width: "100%", textAlign: "left", background: "rgba(160,60,60,0.1)", border: "1px solid rgba(160,60,60,0.3)", color: "#e8d5b0", padding: "12px 16px", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 15, borderRadius: 3, marginBottom: 8 }}>{n}</button>
          ))}
          <button style={{ ...S.btn, marginTop: 4 }} onClick={() => setPhase(PHASE.INTERROGATE)}>← 돌아가기</button>
        </div>
      )}

      {phase === PHASE.RESULT && scenario && result && (
        <div style={{ ...S.card, textAlign: "center", padding: 36 }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>{result.correct ? "🎉" : "💀"}</div>
          <div style={{ fontSize: 22, color: result.correct ? "#7ab88a" : "#c07070", marginBottom: 10 }}>{result.correct ? "사건 해결!" : "수사 실패"}</div>
          <div style={{ color: "#b09870", fontSize: 14, marginBottom: 6 }}>{result.correct ? `정확합니다! 범인은 ${scenario.culprit}이었습니다.` : `틀렸습니다. 범인은 ${scenario.culprit}이었습니다.`}</div>
          <div style={{ color: "#8b7355", fontStyle: "italic", fontSize: 13, margin: "14px 0 24px", lineHeight: 1.7 }}>🔓 {scenario.motive}</div>
          <button style={S.btnBig} onClick={reset}>새 사건 시작</button>
        </div>
      )}
    </div></div>
  );
}
