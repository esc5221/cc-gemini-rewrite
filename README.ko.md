[English](README.md) · **한국어**

# cc-gemini-rewrite

<img src="docs/demo-poster.png" alt="cc-gemini-rewrite — slop 답변을 Gemini가 깔끔하게 재설명, Claude Code 안에서" width="820">

**Claude Code의 기술 답변은 읽기 어려울 때가 많다** — 요점이 겉도는 말과 버즈워드에 파묻힌다.

**cc-gemini-rewrite**가 해결한다:

- **turn이 끝나면 다시 쓴다** — LLM이 같은 답을 바로 쓸 수 있는 형태로 재작성.
- **그 자리에 렌더** — Claude Code 화면에 그대로 스트리밍. 모델을 다시 거치지 않는다.
- **흔적 없음** — 대화 루프·기록·API 히스토리는 건드리지 않는다.

**`/rewrite` — 지금 있는 자리에서 바로 재설명을 띄운다.** 20초 데모:

https://github.com/user-attachments/assets/5cf2a29c-c08a-4184-a771-2b9e0256774f

**cc-turn-ext**(Claude Code turn-end 훅 엔진) 위에 얹은 대표앱. rewrite는 기본 핸들러이고, 원하는 걸 얹을 수 있다.

---

## 설치

macOS arm64 + [bun](https://bun.sh) + [Node](https://nodejs.org).

```bash
git clone https://github.com/esc5221/cc-gemini-rewrite ~/cc-gemini-rewrite
cd ~/cc-gemini-rewrite
./bin/ccturn setup            # 위자드: provider + 키 검증 + policy + 패치
ln -s "$PWD/bin/ccturn" ~/.local/bin/ccturn   # 선택: ccturn을 PATH에
```

원본 `claude`는 안 건드린다. 패치본은 `~/.cc-turn-ext/cache/`에 있고, Claude 업데이트 후 다음 실행 때 자동 재패치(앵커가 문자열 리터럴이라 버전 올라가도 살아남음), 실패하면 원본으로 폴백.

## 사용

`claude` 대신 래퍼로:

```bash
ccturn                 # 인터랙티브 (패치 + 사이드카 + claude 실행)
alias claude=ccturn    # 권장: 그냥 `claude`로 쓰게
```

답이 어려우면 `/rewrite`를 친다 — 바로 밑에 이해되는 버전이 인라인으로 스트리밍된다(Claude 안 거침). 아주 긴 답엔 자동으로도 뜬다.

### `/rewrite` — 메인

직전 실한 답을 재작성:

```
/rewrite
```

일회성 커맨드 — 자동과 같은 주입 경로로, 슬래시 turn 자체 응답은 건너뛰고 마지막 실한 답을 재작성. 자동 정책이 `off`여도 동작.

스티어링:

```
/rewrite 더 짧게
/rewrite 영어로
/rewrite 코드 예시 넣어서
/rewrite 초보자용으로
```

### 명령

```
ccturn setup           최초 위자드 (provider, 키 검증, policy, 패치)
ccturn doctor          진단: 버전·아키·서명·패치·키·연결
ccturn repatch         Claude 업데이트 후 재패치 (보통 자동)
ccturn uninstall       패치본 제거, 백업 복원
ccturn new-handler X   커스텀 핸들러를 ~/.cc-turn-ext/handlers/ 에 생성
/ccturn                policy 상태 (Claude 안 슬래시 커맨드)
/ccturn lines|judge|hybrid|always|off
```

### 자동 트리거 (선택, 안전망)

`/rewrite`가 메인이라 자동 정책은 기본이 보수적 — 아주 긴 답에만 뜬다.

```
off      자동 안 함 (순수 수동, /rewrite만)
always   무조건 재작성
lines    N줄 이상이면 무조건 (룰베이스, LLM 안 씀. 기본 15, 보수적)   ← 기본
judge    LLM이 이해도 판정 (5줄 게이트)
hybrid   N줄↑ 무조건 + 그 아래는 LLM 판단
```

`/ccturn lines|judge|hybrid|always|off` 로 전환.

### 대시보드 — `http://127.0.0.1:61237/`

정책 버튼 · 최근 발동 기록(원본 프리뷰 · 이유 · 재작성 · 지연) · 라이브 오버라이드(모델·임계값·프롬프트) 파일 수정 없이.

## 왜 만들었나

Claude Code 답변은 결론이 묻히고, 왜가 없고, 다음 액션이 안 보일 때가 있다. 되묻기 전에 LLM이 먼저 인라인으로 다시 써준다. 길면(8줄+) 무조건, 아니면 LLM이 이해도 판정 — 기준은 고른다.

## 왜 stop 훅으로는 안 되나

Claude Code에 원래 stop 훅이 있다. 그런데 그걸로 "다시 설명"을 만들면:

```
stop 훅 → LLM이 설명 생성 → 그 텍스트를 Claude 모델에 다시 먹임
        → Claude가 또 읽고 그대로 읊음
        = 왕복 한 번 더 + Claude 재처리 (느리고, Claude를 거쳐 변형됨)
```

그래서 stop 훅 대신 turn이 끝나는 지점을 바이너리에서 후킹해, Claude 모델 안 거치고 화면에 바로 스트리밍한다. 기록·다음 요청엔 안 남는다.

## 동작

```
                         당신 질문
                            │
                   ┌────────▼────────┐
                   │   Claude Code   │   원래 그대로. 대화 루프 안 건드림.
                   │  (turn 진행·응답) │
                   └────────┬────────┘
                            │ turn 종료 (return completed)
          주입된 훅 ┄┄┄┄┄┄┄▶│
                            ▼
                   ┌─────────────────┐   POST /turn-end (cwd)
                   │  sidecar :61237 │   현재 세션 전체 컨텍스트 로드
                   │   policy 판단    │   → 재작성할까?
                   └────────┬────────┘
                    fire?   │ yes                (no → 침묵)
                            ▼
                   ┌─────────────────┐
                   │  LLM (provider) │   같은 내용을 이해되게 다시 씀
                   └────────┬────────┘   (결론 먼저·구체·왜·다음 액션)
                            │ SSE 스트리밍
         ┌──────────────────▼──────────────────┐
         │  Claude Code 화면에 바로 출력         │   마크다운 풀렌더.
         │  (stream_event → 마크다운 커밋)       │   jsonl·API엔 안 남김.
         └─────────────────────────────────────┘
```

판단(policy)과 재작성(rewriter)은 분리. policy는 규칙 5종 중 선택, rewriter는 핸들러.

## Provider

**OpenAI 호환** 엔드포인트면 다 된다. config `provider`:

```
baseUrl          /chat/completions 베이스 (끝 슬래시 X)
model            모델 id
apiKey           인라인 키           (1순위, 비어있지 않으면)
apiKeyEnv        키가 든 env 변수명   (2순위)
apiKeyKeychain   macOS keychain 서비스명 (3순위)
headers          추가 헤더, 예: {"User-Agent":"curl/8.7.1"}
reasoningEffort  "low"=thinking 끔(빠름); "medium"=품질↑·2배 느림
```

키 순서: 인라인 → env → keychain. 빠른 테스트: `CC_LLM_BASE` / `CC_LLM_MODEL` / `CC_LLM_KEY`.

프리셋:

```jsonc
// Gemini (Google)
{ "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.5-flash", "apiKeyEnv": "GEMINI_API_KEY" }
// OpenAI
{ "baseUrl": "https://api.openai.com/v1", "model": "gpt-4o-mini", "apiKeyEnv": "OPENAI_API_KEY" }
// OpenRouter
{ "baseUrl": "https://openrouter.ai/api/v1", "model": "google/gemini-2.5-flash", "apiKeyEnv": "OPENROUTER_API_KEY" }
// 로컬 (ollama / llama.cpp / vLLM)
{ "baseUrl": "http://127.0.0.1:11434/v1", "model": "llama3.1", "apiKey": "" }
```

<details>
<summary><strong>설정 &amp; 커스터마이즈</strong> — 유저 레이어, 우선순위, 핸들러 계약</summary>

내 설정은 **`~/.cc-turn-ext/`** 에 있다 — 패키지는 안 건드리니 업데이트해도 커스텀 유지.

```
~/.cc-turn-ext/
├── config.json        provider / policy / handler 오버라이드
├── prompts.json       내 프롬프트 (핸들러 기본 대체)
├── handlers/mine.mjs  내 커스텀 핸들러
├── state.json         대시보드 라이브 상태 (policy, override)
├── history.jsonl      발동 기록
└── cache/             패치본 (+ .orig 백업)
```

유효 설정 = 병합, 낮은→높은 우선순위:

```
패키지 기본  <  핸들러 프롬프트  <  ~/.cc-turn-ext/config.json  <  prompts.json  <  state.json(대시보드)  <  env
```

커스텀 단계:

```
Lv0  파일 0개   대시보드에서 프롬프트/모델/임계값/정책 라이브 편집
Lv1  프롬프트    ~/.cc-turn-ext/prompts.json
Lv2  provider    ~/.cc-turn-ext/config.json (LLM/프리셋 교체)
Lv3  로직        ccturn new-handler foo → handlers/foo.mjs   (kind: module)
                 또는 kind: command / http → 아무 언어 외부 프로세스
```

핸들러 계약 — 마크다운 청크 yield, 아무것도 안 내면 = 안 함:

```
ctx = { sessionId, cwd, sessionFile, events, chat, lastAssistant, lastUser }
kind: module(기본) | command(stdin ctx JSON, stdout 텍스트) | http(POST → SSE)
```

</details>

## 내부 (바이너리 패치)

Claude Code는 코드서명된 Bun standalone(Mach-O). `core/patcher/patch.mjs`:

- 문자열 앵커 `continue}return{reason:"completed"}`(turn 종료 지점)를 찾고,
- `__BUN` 세그먼트를 페이지만큼 늘려 자기완결 스니펫 주입(Offsets·모듈 포인터·Mach-O 로드커맨드 fixup),
- 주입 모듈을 소스 파싱으로 폴백시키고(JSC 바이트코드라),
- `codesign -f -s -`로 ad-hoc 재서명.

앵커가 문자열 리터럴이라 minify에도 살아남아, Claude 버전이 올라가도 깨끗하게 재패치됨(실측 확인).

<details>
<summary><strong>구조</strong></summary>

```
cc-gemini-rewrite/            (패키지 — 유저는 안 건드림)
├── core/                     ═ cc-turn-ext 엔진 (provider 중립) ═
│   ├── patcher/patch.mjs     바이너리 패치 (grow + fixup + 재서명)
│   ├── inject/snippet.js     주입 스니펫 (stream_event + 1회 커밋)
│   ├── provider.mjs          OpenAI 호환 LLM 클라이언트
│   ├── config.mjs            병합 설정 로더
│   ├── paths.mjs             패키지 + 유저홈 경로
│   └── sidecar/              server · context · policies · resolve · scrub · state · dashboard
├── handlers/
│   ├── gemini-rewrite/       기본 핸들러: handler.mjs · rewriter.mjs · prompts.json
│   └── examples/             더 많은 핸들러
├── defaults/config.json      패키지 기본값
└── bin/ccturn                CLI: launch · setup · doctor · uninstall · new-handler · repatch
```

</details>
