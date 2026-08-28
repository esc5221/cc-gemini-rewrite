[English](README.md) · **한국어**

# cc-gemini-rewrite

Claude Code 답변이 어려우면, LLM이 **같은 답을** 이해되게 다시 써서 바로 아래에 붙인다 — transcript와 Claude의 컨텍스트에는 원문이 그대로 남는다.

![cc-gemini-rewrite — slop 답변을 바로 아래 깔끔하게 재설명](docs/demo-poster.png)

공식 [`MessageDisplay`](https://code.claude.com/docs/en/hooks) 훅 위에 얹은 작은 **Claude Code 플러그인**. 바이너리 패치도, 프록시도 없다. display 전용이라 Claude가 보는 것/하는 것을 절대 바꾸지 않는다.

- **`/rewrite`** — 직전 답을 즉석에서 재설명 (긴 답은 자동으로도 켤 수 있음).
- **transcript 유지** — 재작성은 화면에만. `verbose`로 원문 확인.
- **provider 무관** — OpenAI 호환이면 다 됨 (Gemini, OpenAI, OpenRouter, 로컬).

---

## 설치

macOS/Linux, **Node ≥ 18**, `MessageDisplay` 지원 Claude Code(2.1.x+) 필요.

```bash
git clone https://github.com/esc5221/cc-gemini-rewrite
cd cc-gemini-rewrite
./install.sh     # 앱 복사 + ~/.claude/settings.json에 훅 병합 + 커맨드 등록
```

또는 플러그인으로:

```
/plugin marketplace add esc5221/cc-gemini-rewrite
/plugin install cc-gemini-rewrite@cc-gemini-rewrite
```

그다음 provider 설정 후 **새 claude 세션을 켜고** `/rewrite-doctor`. 제거는 `./uninstall.sh`.

## Provider 설정

**OpenAI 호환** 엔드포인트, `~/.claude/cc-gemini-rewrite/config.json`:

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
/rewrite 더 짧게        스티어링 ("영어로", "초보자용으로" 등)
```

자동 재설명 켜기(선택):

```
/rewrite-config policy lines    N줄 이상 답은 무조건 재설명 (룰베이스)
/rewrite-config policy judge     LLM이 이해도 판정
/rewrite-config policy off       수동 전용 (기본)   ·   /rewrite-config off   전체 일시정지
/rewrite-config                  현재 설정 보기
/rewrite-doctor                  버전 · 훅 · provider 키 · 연결성
```

## 동작

```
Claude가 메시지를 끝냄
        │  MessageDisplay 훅 발동 (chunk마다; final이 전체 메시지를 실음)
        ▼
  delta 버퍼링 → final에 정책 판단 → LLM이 같은 내용을 재작성
        │                              → fidelity 검사 (코드/경로/숫자 보존)
        ▼
  displayContent = 원문 + 재설명 블록      (transcript엔 원문 유지)
```

결정론적 fidelity 검사가 명령·경로·숫자·코드 토큰을 보존하고, 못 하면 원문으로 fail-open 한다. `/rewrite`는 **커맨드의 `Bash` 단계가 도는 동안** 재작성을 미리 계산·캐시해서 블록이 한 번에 딱 뜬다 — 답변 뒤 프리즈 없음. 재작성은 라이브 토큰 스트리밍이 아니라 블록으로 등장하는데, 그게 공식 훅을 쓰는 유일한 대가다.

### 구버전(바이너리 패치)에서 마이그레이션

구버전은 Claude Code 바이너리를 패치했지만, 이건 안 한다 — 공식 훅이다 (구버전은 `binary-patch` 브랜치에 보존). 전환: 옛 `ccturn uninstall` 실행 → 셸 rc의 `alias claude=ccturn` 삭제 → `./install.sh`.

<details>
<summary><strong>설정 레퍼런스</strong></summary>

```
provider.baseUrl / model / apiKey / apiKeyEnv / apiKeyKeychain / headers / reasoningEffort
policy.name       off | always | lines | judge | hybrid
policy.alwaysLines (lines/hybrid 임계, 기본 8)   policy.judgeMinLines (기본 5)
mode              append (원문+블록, 기본) | replace (블록만)
minChars          이보다 짧은 답은 auto 재설명 스킵 (기본 200)
fidelity.check / fidelity.repair   코드/경로/숫자 보존; repair 1회, 그래도 실패면 fail-open
```

</details>

<details>
<summary><strong>구조</strong></summary>

```
.claude-plugin/        plugin.json · marketplace.json
hooks/hooks.json       MessageDisplay 훅 등록
commands/              /rewrite · /rewrite-config · /rewrite-doctor
scripts/message-display.mjs   훅 (buffer → decide → rewrite → display)
scripts/{rewrite,config-cli,doctor}.mjs
core/                  provider · policy · fidelity · transcript · rewriter · display · buffer · state · requests · config · paths
prompts/rewrite-ko.json · defaults/config.json
install.sh · uninstall.sh
```

</details>
