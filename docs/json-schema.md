# jlpt-one-book-n1.json 필드 설명

## 전체 예시

```json
{
  "format": "combined",
  "meta": {
    "level": "jlpt-n1",
    "title": "JLPT 일본어 능력 시험 한권으로 끝내기 N1"
  },
  "days": [
    {
      "day": [
        {
          "items": [
            {
              "id": "u1-i1",
              "index": 1,
              "expression": "腐敗",
              "meaningKo": "부패",
              "readingParts": {
                "kanjiToKana": { "腐": "ふ", "敗": "はい" }
              },
              "problem": {
                "sentence": "梅雨時は食べ物の腐敗が早く進む。",
                "target": "腐敗",
                "choices": ["ふうはい", "ふうばい", "ふはい", "ふばい"],
                "answer": "ふはい",
                "answerText": "ふはい",
                "problemType": "hiragana"
              },
              "lastResult": "NEUTRAL",
              "memoDecomposition": "",
              "memoPersonal": "",
              "stage": 1,
              "nextReviewDate": null,
              "lastAttemptDate": ""
            }
          ],
          "stage": 2,
          "stageCompleteDate": "2025-01-10",
          "nextReviewDate": "2025-01-17",
          "lastAttemptDate": "2025-01-10"
        }
      ]
    }
  ]
}
```

---

## 최상위 구조

```json
{
  "format": "combined",
  "meta": { ... },
  "days": [ ... ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `format` | string | 파일 포맷 식별자. 항상 `"combined"` |
| `meta` | object | 파일 메타정보 |
| `days` | array | 단원 그룹 배열. 각 원소가 하나의 학습 단원 |

---

## meta

| 필드 | 타입 | 설명 |
|------|------|------|
| `level` | string | JLPT 레벨. 예: `"jlpt-n1"` |
| `title` | string | 교재 이름 |

---

## days[i] — 단원 그룹

```json
{
  "day": [ ... ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `day` | array | 이 단원에 속한 Day 배열 |

---

## days[i].day[j] — Day

하루치 학습 단위. SRS 진도 정보와 단어 목록을 담는다.

```json
{
  "items": [ ... ],
  "stage": 1,
  "stageCompleteDate": "2025-01-10",
  "nextReviewDate": "2025-01-17",
  "lastAttemptDate": "2025-01-10"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `items` | array | 이 Day에 속한 단어 목록 |
| `stage` | number \| null | SRS 복습 단계 (1~5). 1=최초학습, 5=완료 |
| `stageCompleteDate` | string \| null | 현재 stage를 완료한 날짜. `"YYYY-MM-DD"` |
| `nextReviewDate` | string \| null | 다음 복습 예정일. `"YYYY-MM-DD"` |
| `lastAttemptDate` | string | 마지막 학습 시도 날짜. `"YYYY-MM-DD"` 또는 `""` |

---

## days[i].day[j].items[k] — 단어 항목

개별 단어/표현의 학습 데이터.

### 식별 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 항목 고유 ID. 예: `"u1-i1"` |
| `index` | number | Day 내 순서 (1부터 시작) |

### 핵심 언어 데이터

| 필드 | 타입 | 설명 |
|------|------|------|
| `expression` | string | 학습 대상 단어/표현 (한자 포함) |
| `meaningKo` | string | 한국어 의미 |
| `readingParts` | object \| null | 읽기 정보. 아래 참조 |
| `reading` | string | 히라가나 읽기 (단순 문자열 형태일 때) |

#### readingParts

| 필드 | 타입 | 설명 |
|------|------|------|
| `kanjiToKana` | object | 한자 → 히라가나 매핑. `{ "腐": "ふ", "敗": "はい" }` |
| `restKana` | string | 한자 이후의 히라가나 부분. 예: `"める"` |

### 학습 진도 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `lastResult` | string | 마지막 퀴즈 결과. `"NEUTRAL"` / `"PASS"` / `"FAIL"` |
| `stage` | number | 항목 레벨 SRS 단계 (Day 레벨 stage와 별도로 기록) |
| `nextReviewDate` | string \| null | 항목 레벨 다음 복습 예정일 |
| `lastAttemptDate` | string | 항목 레벨 마지막 시도 날짜 |

### 메모 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `memoDecomposition` | string | 한자 분해 메모. 마크다운 테이블 형식 |
| `memoPersonal` | string | 개인 암기 메모 |

### 문제 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `problem` | object \| null | 퀴즈 문제 데이터. 없으면 `null` |

#### problem

| 필드 | 타입 | 설명 |
|------|------|------|
| `sentence` | string | 문제 문장 |
| `target` | string | 문장 안에서 정답을 찾아야 할 대상 단어 |
| `choices` | string[] | 선택지 배열 (보통 4개) |
| `answer` | string | 정답 |
| `answerText` | string | 정답 표시용 텍스트 (`answer`와 동일한 경우가 많음) |
| `problemType` | string \| null | 문제 유형. `"hiragana"` / `"similar_expression"` / `null` |

---

## SRS 단계 (stage) 설명

| stage | 의미 |
|-------|------|
| 1 | 최초 학습 전 (미학습) |
| 2 | 1회 학습 완료, 복습 대기 중 |
| 3 | 2회 복습 완료 |
| 4 | 3회 복습 완료 |
| 5 | 4회 복습 완료 (최종 완료) |

---

## lastResult 값

| 값 | 의미 |
|----|------|
| `"NEUTRAL"` | 아직 퀴즈 미시도 또는 초기화 상태 |
| `"PASS"` | 마지막 퀴즈에서 정답 |
| `"FAIL"` | 마지막 퀴즈에서 오답 |
