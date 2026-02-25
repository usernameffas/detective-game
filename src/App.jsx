import { useState, useRef, useEffect } from 'react';

const callClaude = async (system, messages, maxTokens = 2000) => {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, maxTokens }),
  });

  // ✅ 응답이 JSON이 아닐 때도 원인을 보여주기 위해 text로 먼저 받음
  const rawText = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${rawText}`);

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('서버 응답이 JSON이 아님: ' + rawText.slice(0, 200));
  }

  if (data.error) throw new Error(data.error);
  return data.text;
};

const safeParseJSON = (raw) => {
  let t = raw
    .trim()
    .replace(/```json/g, '')
    .replace(/```/g, '');
  t = t.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
  const m = t.match(/\{[\s\S]*\}/);
  if (m) t = m[0];
  return JSON.parse(t);
};

const PHASE = {
  TITLE: 0,
  LOADING: 1,
  INTRO: 2,
  INTERROGATE: 3,
  ACCUSE: 4,
  RESULT: 5,
};

const DUMMY = {
  case_title: '저택의 밀실 살인',
  case_description:
    '빅토리아 시대 저택에서 주인 에드워드 경이 서재에서 독살된 채 발견되었습니다.',
  location: '런던 근교 블랙우드 저택',
  time_of_death: '오후 10시~11시',
  culprit: '박교수',
  motive: '에드워드 경이 박교수의 표절을 폭로하려 했습니다.',
  truth:
    '박교수가 오후 10시에 서재 와인에 독을 탔다. 응접실에 있었다는 알리바이는 거짓이다.',
  suspects: {
    박교수: {
      personality: '냉철하고 논리적이지만 오만함',
      alibi: '오후 10시부터 응접실에서 혼자 책을 읽었다고 주장',
      secret: '피해자의 원고를 몰래 자신의 이름으로 발표했음',
      is_culprit: true,
    },
    최부인: {
      personality: '우아하지만 신경질적',
      alibi: '오후 9시 30분~11시 음악실에서 김청년과 함께 (서로 증언 일치)',
      secret: '에드워드 경과 오래된 로맨스가 있었음',
      is_culprit: false,
    },
    김청년: {
      personality: '젊고 충동적',
      alibi: '오후 9시 30분~11시 음악실에서 최부인과 함께 (서로 증언 일치)',
      secret: '도박 빚으로 에드워드 경에게 돈을 빌리려 했음',
      is_culprit: false,
    },
  },
  clues_public: [
    {
      id: 'c1',
      icon: '🍷',
      title: '독이 든 와인잔',
      content:
        '피해자의 와인잔에서 독성 물질 검출. 저녁 식사 후 각자 방으로 가져간 것으로, 누군가 오후 10시 이후 서재에 들어와 독을 탄 것으로 추정.',
    },
    {
      id: 'c2',
      icon: '📄',
      title: '반쯤 탄 편지',
      content:
        "서재 벽난로에서 발견. '...당신의 죄를 세상에 알리겠소. 내일까지 자백하지 않으면...' 이라는 문구만 읽힘.",
    },
  ],
  clues_hidden: [
    {
      id: 'h1',
      icon: '👞',
      title: '정원 진흙 발자국',
      content:
        '서재 입구 카펫에서 진흙 묻은 발자국 발견. 오후 8시 이후 비가 내렸고, 정원을 지나야만 진흙이 묻을 수 있음.',
      unlock_suspect: '박교수',
      unlock_hint: '그날 밤 동선',
      contradiction: '박교수는 응접실에만 있었다고 했지만 정원 진흙이 묻어있음',
      target_suspect: '박교수',
    },
    {
      id: 'h2',
      icon: '📓',
      title: '피해자의 비밀 일기',
      content:
        "피해자 서랍에서 발견. '그가 내 원고 전체를 훔쳤다. 오늘 밤 담판을 짓겠다.' 날짜는 사망 당일.",
      unlock_suspect: '최부인',
      unlock_hint: '피해자와의 관계',
      contradiction: null,
      target_suspect: '박교수',
    },
    {
      id: 'h3',
      icon: '📚',
      title: '응접실 먼지 쌓인 책',
      content:
        '박교수가 읽었다는 응접실 소파 옆 책에 두꺼운 먼지가 쌓여있음. 최근 누가 읽은 흔적이 없음.',
      unlock_suspect: '김청년',
      unlock_hint: '그날 밤 다른 사람들',
      contradiction: '박교수가 응접실에서 책을 읽었다는 알리바이와 모순',
      target_suspect: '박교수',
    },
  ],
  winning_clues: ['h1', 'h3'],
};

export default function App() {
  const [phase, setPhase] = useState(PHASE.TITLE);
  const [scenario, setScenario] = useState(null);
  const [selectedSuspect, setSelectedSuspect] = useState(null);
  const [histories, setHistories] = useState({});
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [debugLog, setDebugLog] = useState([]);
  const [foundClues, setFoundClues] = useState([]);
  const [presentingClue, setPresentingClue] = useState(null);
  const [newClueAlert, setNewClueAlert] = useState(null);
  const [showClues, setShowClues] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [histories, isThinking]);
  const log = (msg) => setDebugLog((prev) => [...prev, msg]);

  const loadScenario = (sc) => {
    const h = {};
    Object.keys(sc.suspects).forEach((n) => (h[n] = []));
    setScenario(sc);
    setHistories(h);
    setFoundClues(sc.clues_public.map((c) => c.id));
    setSelectedSuspect(Object.keys(sc.suspects)[0]);
    setPhase(PHASE.INTRO);
  };

  const startGame = async () => {
    setError(null);
    setDebugLog([]);
    setPhase(PHASE.LOADING);
    log('API 호출 시작...');
    try {
      const raw = await callClaude(
        'You are a JSON generator. Output ONLY a valid JSON object. No markdown, no line breaks inside string values.',
        [
          {
            role: 'user',
            content: `Create a Korean murder mystery game scenario as JSON. All string values must be single-line. Output ONLY the JSON:

{"case_title":"제목","case_description":"짧은설명","location":"장소","time_of_death":"오후 10시~11시","culprit":"용의자C이름","motive":"동기","truth":"범인이 어떻게 범행했는지 한 줄 진실","suspects":{"홍길동":{"personality":"성격","alibi":"사망시간대 알리바이(목격자있음)","secret":"비밀","intro":"자기소개 한 줄","is_culprit":false},"이수영":{"personality":"성격","alibi":"사망시간대 알리바이(목격자있음)","secret":"비밀","intro":"자기소개 한 줄","is_culprit":false},"박준호":{"personality":"성격","alibi":"사망시간대 알리바이(목격자없음,허점있음)","secret":"범행비밀","intro":"자기소개 한 줄","is_culprit":true}}
RULES:
- suspects 키에 실제 이름 3개 사용 (용의자A/B/C 금지)
- culprit은 세 용의자 중 랜덤으로 선택할 것
- clues_public: 처음부터 보이는 단서, 범인 직접 지목 금지
- clues_hidden: 각 용의자 심문 중 나오는 단서, unlock_suspect 용의자와 대화해야 획득
- winning_clues: 범인을 논리적으로 특정할 수 있는 단서 id 조합 (h1,h3처럼 모순되는 것 2개)
- contradiction이 있는 단서는 반드시 범인 알리바이를 논리적으로 반박해야 함`,
          },
        ]
      );
      log(`응답 받음 (${raw.length}자)`);
      const sc = safeParseJSON(raw);
      log('파싱 성공! 게임 시작');
      loadScenario(sc);
    } catch (e) {
      log(`오류: ${e.message}`);
      setError(e.message);
      setPhase(PHASE.TITLE);
    }
  };

  // 숨겨진 단서 획득 체크
  const checkHiddenClues = (suspectName, message) => {
    if (!scenario) return;
    scenario.clues_hidden.forEach((clue) => {
      if (
        clue.unlock_suspect === suspectName &&
        !foundClues.includes(clue.id)
      ) {
        const keywords = clue.unlock_hint.split(/\s+/);
        const matched = keywords.some((k) => message.includes(k));
        if (matched || Math.random() < 0.4) {
          setFoundClues((prev) => [...prev, clue.id]);
          setNewClueAlert(clue);
          setTimeout(() => setNewClueAlert(null), 3000);
        }
      }
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || isThinking || !selectedSuspect) return;
    const msg = input.trim();
    setInput('');
    setIsThinking(true);
    const suspect = scenario.suspects[selectedSuspect];
    const suspectNames = Object.keys(scenario.suspects).join(', ');

    // 이 용의자에게서 나올 수 있는 단서
    const unlockableClue = scenario.clues_hidden.find(
      (c) => c.unlock_suspect === selectedSuspect && !foundClues.includes(c.id)
    );

    try {
      const reply = await callClaude(
  `당신은 추리 게임 속 용의자 ${selectedSuspect}입니다.
질문을 하는 사람은 사건을 수사 중인 '탐정'입니다. 탐정은 용의자가 아니며, 최부인/박교수/김청년 등 등장인물과는 완전히 다른 인물입니다.
질문자를 항상 '탐정님'이라고 부르고, 절대로 질문자를 최부인/박교수/김청년 등 다른 등장인물로 취급하거나 그렇게 부르지 마세요.

사건: ${scenario.case_description}
사망 추정 시간: ${scenario.time_of_death}
용의자 목록(당신 포함): ${suspectNames}
당신의 성격: ${suspect.personality}
당신의 알리바이: ${suspect.alibi}
당신이 숨기는 비밀: ${suspect.secret}

${suspect.is_culprit
  ? `당신은 실제 범인입니다. 알리바이는 끝까지 일관되게 주장하지만, 탐정이 집요하게 캐물으면 드러날 수 있는 작은 모순과 불안한 기색을 남기세요. 다른 용의자에게 교묘하게 의심을 돌리려고 하세요.`
  : `당신은 범인이 아닙니다. 알리바이는 논리적으로 일관되게, 자신 있게 설명하세요. 다만 숨기고 싶은 비밀이 들킬까 봐 약간의 긴장과 불편한 기색을 드러내세요.`}

답변 스타일 규칙:
- 항상 탐정의 마지막 질문에 직접적으로 답하면서, 3~5문장으로 비교적 자세히 말하세요.
- 말이 너무 짧고 단조롭지 않게, 감정과 분위기(당황, 화남, 긴장 등)를 자연스럽게 섞어서 말하세요.
- 새로운 인물이나 설정을 마음대로 추가하지 말고, 위에 주어진 사건 정보와 용의자 정보 안에서만 이야기하세요.
- 한국어로 자연스럽게 말하세요.`,
  [...histories[selectedSuspect], { role: "user", content: msg }]
);

      setHistories((prev) => ({
        ...prev,
        [selectedSuspect]: [
          ...prev[selectedSuspect],
          { role: 'user', content: msg },
          { role: 'assistant', content: reply },
        ],
      }));

      checkHiddenClues(selectedSuspect, msg + reply);
    } catch (e) {
      setError(e.message);
    }
    setIsThinking(false);
  };

  // 단서 제시
  const presentClue = async (clueId) => {
    if (isThinking || !selectedSuspect) return;
    const allClues = [
      ...(scenario.clues_public || []),
      ...(scenario.clues_hidden || []),
    ];
    const clue = allClues.find((c) => c.id === clueId);
    if (!clue) return;
    setPresentingClue(clueId);
    setIsThinking(true);
    const suspect = scenario.suspects[selectedSuspect];
    const isContradiction =
      clue.target_suspect === selectedSuspect && clue.contradiction;
    try {
      const reply = await callClaude(
        `당신은 추리 게임 용의자 ${selectedSuspect}입니다.
성격: ${suspect.personality}
알리바이: ${suspect.alibi}
비밀: ${suspect.secret}
${suspect.is_culprit ? '당신이 범인입니다.' : '범인이 아닙니다.'}
탐정이 물증을 제시했습니다. 2~3문장 한국어로 반응하세요.
${
  isContradiction
    ? `이 물증은 당신의 알리바이와 모순됩니다: ${clue.contradiction}. 당황하되 어떻게든 변명하려 하세요.`
    : `이 물증은 당신과 직접 관련 없습니다. 자연스럽게 반응하세요.`
}`,
        [
          ...histories[selectedSuspect],
          {
            role: 'user',
            content: `[물증 제시: ${clue.title}] "${clue.content}"`,
          },
        ]
      );
      setHistories((prev) => ({
        ...prev,
        [selectedSuspect]: [
          ...prev[selectedSuspect],
          { role: 'user', content: `🔍 [물증 제시: ${clue.title}]` },
          {
            role: 'assistant',
            content: reply + (isContradiction ? ' ⚠️' : ''),
          },
        ],
      }));
    } catch (e) {
      setError(e.message);
    }
    setIsThinking(false);
    setPresentingClue(null);
  };

  const canAccuse = () => {
    if (!scenario) return false;
    return scenario.winning_clues.every((id) => foundClues.includes(id));
  };

  const accuse = (name) => {
    setResult({ correct: name === scenario.culprit, name });
    setPhase(PHASE.RESULT);
  };

  const reset = () => {
    setScenario(null);
    setResult(null);
    setHistories({});
    setSelectedSuspect(null);
    setError(null);
    setDebugLog([]);
    setFoundClues([]);
    setNewClueAlert(null);
    setShowClues(false);
    setPhase(PHASE.TITLE);
  };

  const suspects = scenario ? Object.keys(scenario.suspects) : [];
  const allClues = scenario
    ? [
        ...scenario.clues_public,
        ...scenario.clues_hidden.filter((c) => foundClues.includes(c.id)),
      ]
    : [];

  const S = {
    root: {
      minHeight: '100vh',
      background: '#0d0a07',
      color: '#e8d5b0',
      fontFamily: 'Georgia, serif',
      padding: '20px 16px',
    },
    wrap: { maxWidth: 680, margin: '0 auto' },
    card: {
      background: '#130e09',
      border: '1px solid #3a2a15',
      borderRadius: 4,
      padding: 20,
      marginBottom: 14,
    },
    lbl: {
      fontSize: 10,
      letterSpacing: 3,
      textTransform: 'uppercase',
      color: '#8b6a2f',
      marginBottom: 10,
      fontFamily: 'monospace',
    },
    btn: {
      background: 'rgba(139,90,43,0.3)',
      border: '1px solid #8b6a2f',
      color: '#e8d5b0',
      padding: '10px 22px',
      cursor: 'pointer',
      fontFamily: 'Georgia, serif',
      fontSize: 14,
      borderRadius: 3,
    },
    btnBig: {
      background: 'rgba(139,90,43,0.4)',
      border: '2px solid #8b6a2f',
      color: '#e8d5b0',
      padding: '13px 44px',
      cursor: 'pointer',
      fontFamily: 'Georgia, serif',
      fontSize: 15,
      borderRadius: 3,
      display: 'block',
      margin: '0 auto',
    },
    btnGray: {
      background: 'rgba(80,80,80,0.3)',
      border: '1px solid #555',
      color: '#aaa',
      padding: '10px 22px',
      cursor: 'pointer',
      fontFamily: 'Georgia, serif',
      fontSize: 13,
      borderRadius: 3,
    },
    btnRed: (disabled) => ({
      background: disabled ? 'rgba(80,80,80,0.2)' : 'rgba(160,60,60,0.2)',
      border: `1px solid ${disabled ? '#555' : '#a03c3c'}`,
      color: disabled ? '#666' : '#e08080',
      padding: '10px 22px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'Georgia, serif',
      fontSize: 14,
      borderRadius: 3,
    }),
    input: {
      flex: 1,
      background: '#0a0704',
      border: '1px solid #3a2a15',
      color: '#e8d5b0',
      padding: '9px 12px',
      fontFamily: 'Georgia, serif',
      fontSize: 14,
      outline: 'none',
      borderRadius: 3,
    },
    sb: (a) => ({
      background: a ? 'rgba(139,90,43,0.35)' : 'rgba(139,90,43,0.1)',
      border: `1px solid ${a ? '#8b6a2f' : '#3a2a15'}`,
      color: '#e8d5b0',
      padding: '8px 14px',
      cursor: 'pointer',
      fontFamily: 'Georgia, serif',
      fontSize: 13,
      borderRadius: 3,
      marginRight: 8,
      marginBottom: 8,
    }),
    clueCard: (presenting) => ({
      background: presenting ? 'rgba(139,90,43,0.2)' : 'rgba(19,14,9,0.8)',
      border: `1px solid ${presenting ? '#8b6a2f' : '#3a2a15'}`,
      borderRadius: 4,
      padding: '8px 12px',
      marginBottom: 8,
      cursor: 'pointer',
      transition: 'all 0.2s',
    }),
  };

  return (
    <div style={S.root}>
      <div style={S.wrap}>
        <h1
          style={{
            fontSize: 24,
            textAlign: 'center',
            color: '#e8d5b0',
            marginBottom: 4,
          }}
        >
          🕵️ 셜록홈즈 추리 게임
        </h1>
        <p
          style={{
            textAlign: 'center',
            color: '#8b7355',
            fontSize: 13,
            marginBottom: 24,
            fontStyle: 'italic',
          }}
        >
          단서를 모아 범인을 밝혀내세요
        </p>

        {/* 새 단서 알림 */}
        {newClueAlert && (
          <div
            style={{
              background: '#1a2a1a',
              border: '1px solid #4a8a4a',
              color: '#8aca8a',
              padding: '12px 16px',
              borderRadius: 4,
              marginBottom: 14,
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            🔍 새 단서 발견: <b>{newClueAlert.title}</b>
          </div>
        )}

        {error && (
          <div
            style={{
              background: '#2a0a0a',
              border: '1px solid #a00',
              color: '#f99',
              padding: 12,
              borderRadius: 4,
              marginBottom: 14,
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          >
            <b>오류:</b> {error}
            <button
              onClick={() => setError(null)}
              style={{
                marginLeft: 10,
                background: 'none',
                border: 'none',
                color: '#f99',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}
        {debugLog.length > 0 && (
          <div
            style={{
              background: '#0a0f0a',
              border: '1px solid #1a3a1a',
              color: '#6a9a6a',
              padding: 10,
              borderRadius: 4,
              marginBottom: 14,
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          >
            {debugLog.map((l, i) => (
              <div key={i}>▸ {l}</div>
            ))}
          </div>
        )}

        {phase === PHASE.TITLE && (
          <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🔍</div>
            <div style={{ color: '#c4a96e', marginBottom: 10, fontSize: 16 }}>
              새로운 사건이 당신을 기다립니다
            </div>
            <div
              style={{
                color: '#8b7355',
                fontSize: 13,
                marginBottom: 28,
                lineHeight: 1.7,
              }}
            >
              용의자를 심문하고 단서를 수집하세요
              <br />
              충분한 증거가 모이면 범인을 지목할 수 있습니다
            </div>
            <button style={S.btnBig} onClick={startGame}>
              🎲 AI 시나리오로 시작
            </button>
            <div style={{ marginTop: 14 }}>
              <button style={S.btnGray} onClick={() => loadScenario(DUMMY)}>
                🗒️ 샘플 시나리오로 시작
              </button>
            </div>
          </div>
        )}

        {phase === PHASE.LOADING && (
          <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
            <div style={{ color: '#8b6a2f', fontSize: 15, marginBottom: 8 }}>
              ⏳ 시나리오 생성 중...
            </div>
            <div style={{ color: '#5a4a35', fontSize: 12 }}>
              10~20초 정도 걸릴 수 있습니다
            </div>
          </div>
        )}

        {phase === PHASE.INTRO && scenario && (
          <>
            <div style={S.card}>
              <div style={S.lbl}>사건명</div>
              <div
                style={{
                  fontSize: 20,
                  color: '#e8d5b0',
                  marginBottom: 8,
                  fontStyle: 'italic',
                }}
              >
                {scenario.case_title}
              </div>
              <div
                style={{
                  color: '#b09870',
                  lineHeight: 1.8,
                  fontSize: 14,
                  marginBottom: 8,
                }}
              >
                {scenario.case_description}
              </div>
              <div style={{ color: '#c4906a', fontSize: 13, marginBottom: 4 }}>
                ⏰ 사망 추정 시간: <b>{scenario.time_of_death}</b>
              </div>
              <div style={{ color: '#5a4a35', fontSize: 12 }}>
                📍 {scenario.location}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.lbl}>공개 단서</div>
              {scenario.clues_public.map((c) => (
                <div
                  key={c.id}
                  style={{
                    marginBottom: 12,
                    paddingLeft: 10,
                    borderLeft: '2px solid #3a2a15',
                  }}
                >
                  <div
                    style={{ color: '#8b6a2f', fontSize: 12, marginBottom: 3 }}
                  >
                    {c.icon} {c.title}
                  </div>
                  <div
                    style={{ color: '#c4a96e', fontSize: 13, lineHeight: 1.7 }}
                  >
                    {c.content}
                  </div>
                </div>
              ))}
              <div
                style={{
                  color: '#5a4a35',
                  fontSize: 11,
                  fontStyle: 'italic',
                  marginTop: 8,
                }}
              >
                💡 심문 중 추가 단서를 발견할 수 있습니다
              </div>
            </div>
            <div style={S.card}>
              <div style={S.lbl}>용의자</div>
              <div style={{ color: '#c4a96e', fontSize: 14 }}>
                {suspects.join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <button
                style={S.btnBig}
                onClick={() => setPhase(PHASE.INTERROGATE)}
              >
                심문 시작 →
              </button>
            </div>
          </>
        )}

        {phase === PHASE.INTERROGATE && scenario && (
          <>
            {/* 단서 패널 */}
            <div
              style={{
                background: '#130e09',
                border: '1px solid #3a2a15',
                borderRadius: 4,
                marginBottom: 14,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setShowClues((o) => !o)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: '#8b6a2f',
                  padding: '12px 20px',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>📋 수집한 단서 ({foundClues.length}개)</span>
                <span>{showClues ? '▲' : '▼'}</span>
              </button>
              {showClues && (
                <div
                  style={{
                    padding: '0 16px 16px',
                    borderTop: '1px solid #3a2a15',
                  }}
                >
                  <div
                    style={{
                      color: '#5a4a35',
                      fontSize: 11,
                      fontStyle: 'italic',
                      margin: '10px 0 12px',
                    }}
                  >
                    단서를 클릭하면 현재 용의자에게 제시합니다
                  </div>
                  {allClues.map((c) => (
                    <div
                      key={c.id}
                      style={S.clueCard(presentingClue === c.id)}
                      onClick={() => presentClue(c.id)}
                    >
                      <div
                        style={{
                          color: '#8b6a2f',
                          fontSize: 11,
                          marginBottom: 3,
                        }}
                      >
                        {c.icon} {c.title}
                      </div>
                      <div
                        style={{
                          color: '#b09870',
                          fontSize: 12,
                          lineHeight: 1.6,
                        }}
                      >
                        {c.content}
                      </div>
                    </div>
                  ))}
                  {!canAccuse() && (
                    <div
                      style={{
                        color: '#5a4a35',
                        fontSize: 11,
                        fontStyle: 'italic',
                        marginTop: 8,
                      }}
                    >
                      🔒 범인 지목하려면 더 많은 단서가 필요합니다
                    </div>
                  )}
                  {canAccuse() && (
                    <div
                      style={{ color: '#7ab88a', fontSize: 12, marginTop: 8 }}
                    >
                      ✅ 충분한 단서가 모였습니다. 범인을 지목할 수 있습니다!
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={S.card}>
              <div style={S.lbl}>용의자 선택</div>
              <div>
                {suspects.map((n) => (
                  <button
                    key={n}
                    style={S.sb(selectedSuspect === n)}
                    onClick={() => setSelectedSuspect(n)}
                  >
                    {n}
                    {histories[n]?.length > 0
                      ? ` (${histories[n].length / 2})`
                      : ''}
                  </button>
                ))}
              </div>
            </div>

            {selectedSuspect && (
              <div style={S.card}>
                <div style={S.lbl}>심문 중: {selectedSuspect}</div>
                <div
                  style={{
                    minHeight: 180,
                    maxHeight: 320,
                    overflowY: 'auto',
                    marginBottom: 12,
                  }}
                >
                  {histories[selectedSuspect].length === 0 && (
                    <div
                      style={{
                        color: '#5a4a35',
                        fontStyle: 'italic',
                        fontSize: 13,
                      }}
                    >
                      질문을 입력하거나 단서를 제시하세요...
                    </div>
                  )}
                  {histories[selectedSuspect].map((m, i) => (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: m.role === 'user' ? '#5a8a6a' : '#8b6a2f',
                          marginBottom: 3,
                          letterSpacing: 1,
                        }}
                      >
                        {m.role === 'user' ? '탐정' : selectedSuspect}
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          lineHeight: 1.7,
                          padding: '8px 12px',
                          borderLeft: `2px solid ${
                            m.role === 'user' ? '#5a8a6a' : '#8b6a2f'
                          }`,
                          color: m.role === 'user' ? '#a8c8b0' : '#c4a96e',
                        }}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {isThinking && (
                    <div
                      style={{
                        color: '#8b6a2f',
                        fontStyle: 'italic',
                        fontSize: 12,
                      }}
                    >
                      답변 중...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={S.input}
                    placeholder="질문을 입력하세요 (Enter)"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    disabled={isThinking}
                  />
                  <button
                    style={S.btn}
                    onClick={sendMessage}
                    disabled={isThinking || !input.trim()}
                  >
                    질문
                  </button>
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center' }}>
              <button
                style={S.btnRed(!canAccuse())}
                onClick={() => canAccuse() && setPhase(PHASE.ACCUSE)}
              >
                {canAccuse() ? '🎯 범인 지목하기' : '🔒 단서 더 수집 필요'}
              </button>
            </div>
          </>
        )}

        {phase === PHASE.ACCUSE && scenario && (
          <div style={S.card}>
            <div style={S.lbl}>최종 지목</div>
            <div
              style={{
                color: '#8b7355',
                fontSize: 13,
                marginBottom: 8,
                fontStyle: 'italic',
              }}
            >
              범인이라고 생각하는 사람을 선택하세요
            </div>
            <div style={{ color: '#5a4a35', fontSize: 11, marginBottom: 16 }}>
              수집한 단서: {allClues.map((c) => c.title).join(', ')}
            </div>
            {suspects.map((n) => (
              <button
                key={n}
                onClick={() => accuse(n)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'rgba(160,60,60,0.1)',
                  border: '1px solid rgba(160,60,60,0.3)',
                  color: '#e8d5b0',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontFamily: 'Georgia, serif',
                  fontSize: 15,
                  borderRadius: 3,
                  marginBottom: 8,
                }}
              >
                {n}
              </button>
            ))}
            <button
              style={{ ...S.btn, marginTop: 4 }}
              onClick={() => setPhase(PHASE.INTERROGATE)}
            >
              ← 돌아가기
            </button>
          </div>
        )}

        {phase === PHASE.RESULT && scenario && result && (
          <div style={{ ...S.card, textAlign: 'center', padding: 36 }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>
              {result.correct ? '🎉' : '💀'}
            </div>
            <div
              style={{
                fontSize: 22,
                color: result.correct ? '#7ab88a' : '#c07070',
                marginBottom: 10,
              }}
            >
              {result.correct ? '사건 해결!' : '수사 실패'}
            </div>
            <div style={{ color: '#b09870', fontSize: 14, marginBottom: 6 }}>
              {result.correct
                ? `정확합니다! 범인은 ${scenario.culprit}이었습니다.`
                : `틀렸습니다. 범인은 ${scenario.culprit}이었습니다.`}
            </div>
            <div
              style={{
                color: '#8b7355',
                fontStyle: 'italic',
                fontSize: 13,
                margin: '14px 0 24px',
                lineHeight: 1.7,
              }}
            >
              🔓 {scenario.motive}
            </div>
            <button style={S.btnBig} onClick={reset}>
              새 사건 시작
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
