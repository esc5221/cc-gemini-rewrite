[English](README.md) · **한국어**

# cc-gemini-rewrite

Claude Code 답변이 어려우면, LLM(기본 Gemini)이 **같은 답을** 이해되게 다시 써서 **원문 바로 아래** 화면에 붙인다 — Claude의 컨텍스트와 JSONL transcript에는 원문이 그대로 남는다.

공식 [`MessageDisplay`](https://code.claude.com/docs/en/hooks) 훅 위에 얹은 작은 **Claude Code 플러그인**이다. 바이너리 패치도, 프록시도 없다. display 전용이라 Claude가 보는 것/하는 것을 절대 바꾸지 않는다.

```
❯ 내 SQL 쿼리 왜 느려?
⏺ 좋은 질문이에요! …데이터 계층의 최적화되지 않은 성능… 업계 표준 최적화…
  처리량과 지연 시간에서 의미 있는 개선을! 🚀

  ────────────
  [re-explained by Gemini]
  쿼리가 느린 건 DB가 인덱스 없는 데이터를 디스크에서 읽거나, 플래너가
  나쁜 계획을 고르거나, 반복 읽기가 캐시를 안 타서다.
  다음: EXPLAIN으로 실행 계획을 보고 병목을 짚어라.
```

---

## 동작

```
Claude가 메시지를 끝냄
        │  MessageDisplay 훅 발동 (chunk마다; final이 전체 메시지를 실음)
        ▼
  delta 버퍼링 → final에 정책 판단 → LLM이 같은 내용을 재작성
        │                              → fidelity 검사 (코드/경로/숫자 보존)
        ▼
  displayContent = 원문 + 재설명 블록   (transcript엔 원문 유지)
```

- **display 전용.** 재작성은 화면에만. transcript·다음 요청은 그대로. `verbose`로 원문 확인 가능.
- **스트리밍 아닌 블록.** 훅은 final에 한 번 반환 → 재작성은 (LLM 지연 후) 블록으로 뜬다. 토큰 단위 스트리밍 아님.
- **fail-open.** 에러·타임아웃(60s)·fidelity 실패 시 원문 그대로 표시.

## 설치

macOS/Linux, **Node ≥ 18**, `MessageDisplay` 지원 Claude Code(2.1.x+) 필요. 설치 후 `/rewrite-doctor`로 확인.

플러그인으로:

```
git clone https://github.com/esc5221/cc-gemini-rewrite
/plugin marketplace add <경로-또는-repo>
/plugin install cc-gemini-rewrite
```

또는 `~/.claude/settings.json`에 훅 직접 등록:

```json
{
  "hooks": {
    "MessageDisplay": [
      { "hooks": [ { "type": "command", "command": "node /abs/path/cc-gemini-rewrite/scripts/message-display.mjs", "timeout": 60 } ] }
    ]
  }
}
```

그다음 provider 설정 후 `/rewrite-doctor`.

## Provider 설정

**OpenAI 호환** 엔드포인트면 다 된다. `~/.claude/cc-gemini-rewrite/config.json`:

```json
{
  "provider": {
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
    "model": "gemini-2.5-flash",
    "apiKeyEnv": "GEMINI_API_KEY"
  }
}
```

키 순서: `apiKey`(인라인) → `apiKeyEnv`(env) → `apiKeyKeychain`(macOS 키체인). 셸별 오버라이드: `CCR_BASE` / `CCR_MODEL` / `CCR_KEY`.

## 사용

기본 정책은 **off** — 부를 때까지 아무것도 안 뜬다.

```
/rewrite               직전 답을 인라인으로 재설명
/rewrite 더 짧게        스티어링 (아무 힌트: "영어로", "초보자용으로")
```

자동 재설명 켜기(선택, 안전망):

```
/rewrite-config policy lines    N줄 이상 답은 무조건 재설명 (LLM 게이트 없음)
/rewrite-config policy judge    LLM이 이해도 판정
/rewrite-config policy off      수동 전용으로 (기본)
/rewrite-config off             플러그인 전체 일시정지
/rewrite-config                 현재 설정 보기
```

진단: `/rewrite-doctor` (버전 · 훅 · provider 키 · 연결성)

## 설정 레퍼런스

```
provider.baseUrl / model / apiKey / apiKeyEnv / apiKeyKeychain / headers / reasoningEffort
policy.name       off | always | lines | judge | hybrid
policy.alwaysLines (lines/hybrid 임계, 기본 8)   policy.judgeMinLines (기본 5)
mode              append (원문+블록, 기본) | replace (블록만)
minChars          이보다 짧은 답은 auto 재설명 스킵 (기본 200)
fidelity.check / fidelity.repair   코드/경로/숫자 보존; repair 1회, 그래도 실패면 fail-open
```

## 구조

```
.claude-plugin/plugin.json   플러그인 매니페스트
hooks/hooks.json             MessageDisplay 훅 등록
commands/                    /rewrite · /rewrite-config · /rewrite-doctor
scripts/message-display.mjs  훅 엔트리 (buffer → decide → rewrite → display)
scripts/{rewrite,config-cli,doctor}.mjs
core/                        provider · policy · fidelity · transcript · rewriter · display · buffer · state · requests · config · paths
prompts/rewrite-ko.json      재작성 + judge 프롬프트
defaults/config.json         패키지 기본값
```
