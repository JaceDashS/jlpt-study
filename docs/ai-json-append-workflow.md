# AI JSON Append Workflow

사진을 다른 AI에 보내 텍스트를 JSON으로 받아오고, 그 JSON을 로컬 파일에 계속 누적할 때 사용하는 작업 흐름입니다.

이 작업에서는:

- 한자/표현(`expression`)과 뜻(`meaningKo`)은 이미지에서 읽습니다.
- 후리가나 정보(`readingParts`)는 AI가 직접 작성합니다.
- 문제(`problem`)는 작성하지 않습니다.

이 워크플로우는 다음 원칙으로 동작합니다.

- 중복 검사는 하지 않습니다.
- 한 줄에 직렬화된 JSON 하나를 입력합니다.
- Enter를 누르면 그 줄이 바로 append 됩니다.
- 대상 JSON 파일이 없으면 자동으로 초기화합니다.
- 아이템은 20개씩 하나의 `day` 로 묶어 저장합니다.

## 추천 출력 형식

실제 저장 구조는 [jlpt-one-book-n1.json](c:\workspace\dev\jlpt\asset\jlpt-one-book-n1.json) 형식에 맞춥니다. 현재 실제 파일은 `format/meta/days/day/items` 구조를 사용합니다.

그래서 다른 AI에도 가능하면 **실제 아이템 키에 가까운 한 줄짜리 직렬화 JSON 배열**로 응답하라고 요청하는 편이 좋습니다.

### 권장 예시

```json
[{"expression":"腐敗","meaningKo":"부패","readingParts":{"kanjiToKana":{"腐":"ふ","敗":"はい"}},"memoPersonal":"","lastResult":"NEUTRAL","stage":1},{"expression":"戒める","meaningKo":"경고하다, 징계하다","readingParts":{"kanjiToKana":{"戒":"いまし"},"restKana":"める"},"memoPersonal":"","lastResult":"NEUTRAL","stage":1}]
```

정보가 적을 때는 최소한 아래 수준으로 받아도 됩니다.

```json
[{"expression":"腐敗","meaningKo":"부패"},{"expression":"粘膜","meaningKo":"점막"}]
```

이 경우 append 스크립트가 `readingParts`, `problem`, `lastResult`, `memoDecomposition`, `memoPersonal`, `stage`, `nextReviewDate`, `lastAttemptDate` 기본값을 자동으로 채웁니다.

## 다른 AI에게 보낼 최종 프롬프트

아래 프롬프트 하나만 사용하면 됩니다.

```text
이 사진에서 일본어 단어/표현과 한국어 뜻을 읽어서 JSON으로만 답해줘.
설명 문장, 마크다운, 코드블록 없이 순수 JSON 한 줄만 출력해줘.
반드시 직렬화된 JSON 배열 형태로 답해줘.
각 원소는 반드시 아래 키를 포함해줘:
- expression
- meaningKo
- readingParts

expression 과 meaningKo 는 이미지에 있는 내용을 기준으로 적어줘.
readingParts 는 이미지에 후리가나가 없어도 일본어 읽기를 판단해서 직접 작성해줘.
readingParts 는 아래 형태로 작성해줘:
- 한자만 있으면 {"kanjiToKana":{"腐":"ふ","敗":"はい"}}
- 오쿠리가나가 있으면 {"kanjiToKana":{"戒":"いまし"},"restKana":"める"}

problem 객체는 만들지 마.
문제는 만들지 마.
응답에는 expression, meaningKo, readingParts 만 넣어줘.
그 외 기본값은 내가 로컬 파이썬 스크립트로 채울 거야.

응답 형식 예시:
[{"expression":"腐敗","meaningKo":"부패","readingParts":{"kanjiToKana":{"腐":"ふ","敗":"はい"}}},{"expression":"戒める","meaningKo":"경고하다, 징계하다","readingParts":{"kanjiToKana":{"戒":"いまし"},"restKana":"める"}}]
```

## 스크립트 사용법

스크립트 경로:

`scripts/append-json-from-clipboard.py`

실행 예시:

```bash
python scripts/append-json-from-clipboard.py asset/imported-items.json
```

실행 후 입력 예시:

```text
> [{"expression":"腐敗","meaningKo":"부패","readingParts":{"kanjiToKana":{"腐":"ふ","敗":"はい"}}},{"expression":"粘膜","meaningKo":"점막","readingParts":null}]
```

한 줄을 입력하고 Enter를 누르면 바로 append 됩니다.

종료할 때는 아래처럼 입력합니다.

```text
> EXIT
```

## 동작 방식

1. 대상 파일이 없으면 `asset/jlpt-one-book-n1.json`과 같은 `format/meta/days/day/items` 구조로 초기화합니다.
2. 한 줄에 직렬화된 JSON 객체 또는 배열을 입력합니다.
3. Enter를 누르면 즉시 append 합니다.
4. 중복 검사는 하지 않습니다.
5. `problem` 없이도 append 할 수 있습니다.
6. 일부 키가 빠져 있어도 스크립트가 앱 아이템 기본값 일부를 자동으로 채웁니다.
7. 누적된 전체 아이템을 다시 계산해서 20개씩 `days[].day[].items[]` 형태로 저장합니다.
8. 출력 JSON은 `asset/jlpt-one-book-n1.json`과 같은 루트 구조를 사용합니다.

## 출력 예시

입력 한 줄이 처리되면 아래와 같은 메시지가 나옵니다.

```text
Input item count: 2
Appended 2 item(s) to C:\workspace\dev\jlpt\asset\imported-items.json
Append target: days
Total items now: 10
```

## 출력 파일 구조

저장 결과는 아래처럼 `days[].day[]` 구조를 사용합니다.

```json
{
  "format": "combined",
  "meta": {
    "level": "jlpt-n1",
    "title": "imported-items"
  },
  "days": [
    {
      "day": [
        {
          "stage": 1,
          "stageCompleteDate": null,
          "nextReviewDate": null,
          "lastAttemptDate": "",
          "items": [
            {
              "id": "d1-i1",
              "index": 1,
              "expression": "腐敗",
              "meaningKo": "부패",
              "readingParts": {
                "kanjiToKana": {
                  "腐": "ふ",
                  "敗": "はい"
                }
              },
              "problem": null,
              "lastResult": "NEUTRAL",
              "memoDecomposition": "",
              "memoPersonal": "",
              "stage": 1,
              "nextReviewDate": null,
              "lastAttemptDate": ""
            },
            {
              "id": "d1-i2",
              "index": 2,
              "expression": "粘膜",
              "meaningKo": "점막",
              "readingParts": null,
              "problem": null,
              "lastResult": "NEUTRAL",
              "memoDecomposition": "",
              "memoPersonal": "",
              "stage": 1,
              "nextReviewDate": null,
              "lastAttemptDate": ""
            }
          ]
        }
      ]
    }
  ]
}
```

아이템이 21개가 되면:

- 1~20개는 `days[0].day[0].items`
- 21~40개는 `days[1].day[0].items`

처럼 자동으로 묶입니다.

## 대상 파일 규칙

스크립트는 아래 두 형태를 지원합니다.

### 1. 권장 형식: `jlpt-one-book-n1.json` 초기화 패턴

가장 권장하는 형식은 아래처럼 `days[].day[]` 구조입니다.

```json
{
  "format": "combined",
  "meta": {
    "level": "jlpt-n1",
    "title": "imported-items"
  },
  "days": []
}
```

파일이 처음부터 없다면 이 형식으로 자동 생성됩니다.

### 2. 기존 배열 파일도 읽을 수는 있음

예전에 아래처럼 최상위 배열로 저장된 파일도 읽을 수 있습니다.

```json
[
  {
    "expression": "기존 데이터"
  }
]
```

다만 새로 append 하는 순간 전체 내용을 `days` 구조로 다시 저장합니다.

## 주의사항

- 한 줄 전체가 유효한 JSON 이어야 합니다.
- 여러 줄 JSON은 현재 입력 방식과 맞지 않습니다.
- ```json 같은 코드펜스가 포함되면 파싱이 실패할 수 있습니다.
- 이 스크립트는 중복 제거, 정렬, 스키마 검증을 하지 않습니다.
- `expression`과 `meaningKo` 중심의 느슨한 입력도 받을 수 있지만, 가능하면 실제 키 이름을 쓰는 편이 좋습니다.
- `meaning` 은 자동으로 `meaningKo` 로 옮깁니다.
- `memo` 는 자동으로 `memoPersonal` 로 옮깁니다.
- `readingParts`, `problem`, `lastResult`, `memoDecomposition`, `memoPersonal`, `stage`, `nextReviewDate`, `lastAttemptDate` 는 기본값이 자동 보정됩니다.
- 루트에는 `format`, `meta`, `days`만 유지하고 나머지 임시 루트 필드는 제거합니다.
- 기존 구조가 최상위 배열, `items` 배열 객체, `days`/`unitSteps` 객체가 아니면 append 하지 않고 에러를 냅니다.

## 추천 운영 방식

- 원본 OCR 결과는 별도 파일에 계속 누적합니다.
- 이후 필요할 때만 수동 검토해서 실제 서비스용 JSON 구조로 옮깁니다.
- 즉, `임시 수집 파일`과 `최종 자산 파일`을 분리해서 관리하는 것이 안전합니다.
