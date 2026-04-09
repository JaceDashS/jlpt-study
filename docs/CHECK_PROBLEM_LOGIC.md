# check:problem 로직 스펙

## 1) 범위(Scope)
- 대상 파일: `asset/**/src.json` (동일 폴더에 `src.json`이 없으면 `index.json` fallback 허용)
- 대상 아이템: 문제 형태(`sentence`, `choices`, `answer`)를 가진 항목만 문제 검증 대상으로 본다.
- 비대상 아이템: 단어장 전용 항목(`expression`, `reading`, `meaningKo` 등)은 문제 계층 검증에서 제외한다.

## 2) 문제 타입(Problem Type)
- 허용 타입
  - `hiragana`
  - `fill_blank`
  - `usage_problem`
  - `similar_expression`
- `unknown`은 허용하지 않음 (`ERROR`)

## 3) 검증 계층(Validation Layers)

### A. `validate:structure`
- JSON 파싱 가능 여부
- 문제 필수 필드 타입 검사
  - `sentence: string`
  - `choices: string[]`
  - `answer: string`
- 문제 타입 분류 가능 여부
- 모지바케(깨진 문자열) 패턴 감지
- expression 스키마 강제
  - `word/kanji` 키 존재 시 `ERROR`
  - `expression` 누락 시 `ERROR`

### B. `validate:consistency`
- 타입별 필드 정합성 검사
- `hiragana` 유형에서 `expression === problem.target` 검사
- `answer/choices` 정합성 검사
  - 정규화된 answer가 choices에 존재해야 함
- `readingParts` 기반 읽기와 answer 정합성(`hiragana` 유형)
- `ending-hiragana` 검사(`hiragana` 유형)
- `target-length-gap` 검사(`hiragana` 유형, 경고 성격)

### C. `validate:choices`
- 중복 선택지 검사 (`WARN`)
- 숫자/번호 라벨 포함 선택지 검사 (`ERROR`)
- cheat-pattern 검사
  - `RULE_EXACT_ANSWER_IN_CHOICES` (`ERROR`)
  - `RULE_TOO_FAR_FROM_ANSWER` (`WARN`)
  - `RULE_UNNATURAL_NUMBER_IN_CHOICE` (`ERROR`)
  - `RULE_UNNATURAL_REPEAT_PATTERN` (`ERROR`)

### D. `validate:reading`
- 읽기형(`hiragana`) 문제의 히라가나 커버리지 검사
- `target`에 포함된 히라가나가 choices/answer에 충분히 반영되는지 확인

## 4) 공통 CLI 계약
- `--file <path>`: 단일 파일 검사
- `--glob <pattern>`: 패턴 검사
- 인자 없음: 전체 검사(`asset/**/src.json`)
- 공통 파일 해석 유틸: `resolveTargetFiles({ file, glob, root })`

## 5) Severity 정책
- `ERROR`: 배포 차단
  - 구조 위반, 필수 필드 위반, 타입 미분류, 핵심 정합성 위반
- `WARN`: 품질 경고
  - 선택지 품질, 일부 난이도/정합 보정 규칙
- `INFO`: 통계/참고

## 6) 집계 명령(`check:problem`)
- 실행 순서
  1. `validate:structure`
  2. `validate:consistency`
  3. `validate:choices`
  4. `validate:reading`
- 상위 명령이 하위 validator에 동일 CLI 인자를 전달

## 7) 실행 예시
- 전체 검사
  - `npm run check:problem`
- 단일 파일 검사
  - `npm run check:problem -- --file "asset/.../src.json"`
- 특정 계층만 실행
  - `npm run validate:consistency -- --file "asset/.../src.json"`
