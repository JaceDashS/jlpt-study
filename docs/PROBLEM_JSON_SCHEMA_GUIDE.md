# 문제 포함 JSON 스키마 가이드

이 문서는 아래 5개 파일(문제 포함 데이터)의 실제 구조를 기준으로 작성했습니다.

1. `asset/제2장 문자어휘 예상 공략편/예상어휘 공략하기.json`
2. `asset/제1장 문자・어휘 기출 공략편/問題２ 문맥규정 공략하기.json`
3. `asset/제1장 문자・어휘 기출 공략편/問題１ 한자읽기 공략하기.json`
4. `asset/제1장 문자・어휘 기출 공략편/問題３ 유의표현 공략하기.json`
5. `asset/제1장 문자・어휘 기출 공략편/問題４ 용법 공략하기.json`

## 1) 최상위(root) 구조

```json
{
  "formatVersion": 2,
  "source": "index.json",
  "section": "문자열",
  "totalWords": 0,
  "totalProblems": 0,
  "days": []
}
```

- 필수 키: `formatVersion`, `source`, `section`, `totalWords`, `totalProblems`, `days`
- `days`는 배열

## 2) Day 구조

```json
{
  "day": 1,
  "stage": 1,
  "stageCompleteDate": null,
  "nextReviewDate": null,
  "lastAttemptDate": "",
  "items": []
}
```

- 필수 키: `day`, `items`
- 선택 키: `stage`, `stageCompleteDate`, `nextReviewDate`, `lastAttemptDate`
- `items`는 배열

## 3) Item 구조

실데이터에서 확인된 item 키:

- 공통/핵심: `index`, `id`, `expression`, `meaningKo`, `problem`
- 학습 상태: `stage`, `nextReviewDate`, `lastResult`
- 메모: `memoDecomposition`, `memoPersonal`
- 읽기 정보: `readingParts`
- 동의/유사 표현(일부 파일에서만 등장): `equivalent`, `equivalentMeaningKo`, `equivalents`, `synonyms`

권장 최소 키(앱 동작 기준):

```json
{
  "index": 1,
  "id": "d1-i1",
  "expression": "漢字",
  "meaningKo": "의미",
  "lastResult": "NEUTRAL",
  "problem": {
    "sentence": "문장",
    "target": "타겟",
    "choices": ["보기1", "보기2", "보기3", "보기4"],
    "answer": "보기1"
  }
}
```

- `lastResult` 허용값: `NEUTRAL`, `PASS`, `FAIL`

## 4) problem 구조(중요)

`problem` 객체 키:

- `sentence`: 문제 문장 (문자열)
- `target`: 타겟 표기 (문자열, 빈 문자열 허용은 비권장)
- `choices`: 보기 배열 (문자열 배열, 일반적으로 4개)
- `answer`: 정답 (문자열, `choices` 중 하나)

필수 규칙:

1. `problem`은 `object`여야 함 (`null` 금지, 문제 포함 JSON 기준)
2. `choices.length >= 2` (실운영은 4개 권장)
3. `answer`는 `choices` 안에 있어야 함
4. `sentence`는 빈 문자열이면 안 됨

## 5) 표기/품질 규칙

`PROBLEM_AUTHORING_GUIDE.md`와 함께 아래 규칙을 적용합니다.

1. 보기에는 숫자 표식을 넣지 않음 (`1`, `2`, `...る1` 등 금지)
2. 타겟 히라가나 단서가 정답에만 노출되지 않게 구성
3. 타겟 종료 뒤에 히라가나를 덧붙이는 패턴 금지  
   예: `閉まる` -> `閉まるまる` (금지)

## 6) 검증 명령어

문제 데이터 점검 시 아래 명령 사용:

```bash
npm run check:problem
```

개별 점검:

```bash
npm run check:problem-hiragana
npm run check:problem-ending-hiragana
npm run check:problem-duplicate
npm run check:problem-choice-number
npm run check:problem-cheat-pattern
```

## 7) 작성 체크리스트

1. root/day/item/problem 키가 스키마와 일치하는가
2. `problem.answer`가 `problem.choices`에 포함되는가
3. `choices`가 의미상 그럴듯한 오답을 포함하는가
4. 숫자/표식 기반 치트 패턴이 없는가
5. 끝 히라가나 반복/덧붙임 오류(예: `閉まるまる`)가 없는가
6. `lastResult`가 `NEUTRAL|PASS|FAIL` 중 하나인가

## 8) 통합 예시 (전체 JSON)

```json
{
  "formatVersion": 2,
  "source": "index.json",
  "section": "문제유형 공략하기",
  "totalWords": 1,
  "totalProblems": 1,
  "days": [
    {
      "day": 1,
      "stage": 1,
      "stageCompleteDate": null,
      "nextReviewDate": null,
      "lastAttemptDate": "",
      "items": [
        {
          "index": 1,
          "id": "d1-i1",
          "expression": "閉まる",
          "meaningKo": "닫히다",
          "readingParts": {
            "kanjiToKana": {
              "閉": "し"
            },
            "restKana": "まる"
          },
          "problem": {
            "sentence": "ドアが急に（　）。",
            "target": "閉まる",
            "choices": [
              "しまる",
              "しぼる",
              "しめる",
              "しがる"
            ],
            "answer": "しまる"
          },
          "lastResult": "NEUTRAL",
          "memoDecomposition": "",
          "memoPersonal": ""
        }
      ]
    }
  ]
}
```

## 9) Day 일정 필드 추가 규칙 (`stageCompleteDate`)

`Day` 객체에는 아래 순서로 필드를 둡니다.

1. `day`
2. `stage`
3. `stageCompleteDate`
4. `nextReviewDate`
5. `lastAttemptDate`
6. `items`

예시:

```json
{
  "day": 1,
  "stage": 1,
  "stageCompleteDate": null,
  "nextReviewDate": null,
  "lastAttemptDate": "",
  "items": []
}
```

규칙:
- `stageCompleteDate`는 Day 기본값이 `null`입니다.
- Day의 `stage`가 실제로 상승한 날에만 `YYYY-MM-DD` 문자열로 기록합니다.
- 같은 stage를 유지한 경우에는 기존 값을 유지합니다.
- 홈의 "오늘 신규 학습" 완료 판단은 `stageCompleteDate === 오늘 날짜` 기준을 사용합니다.
