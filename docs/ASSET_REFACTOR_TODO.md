# 에셋 리팩토링 TODO (영문 경로 + 레벨 선택)

## 목표
- `asset` 경로/파일명을 영문 ASCII로 리팩토링한다.
- 모지바케(문자 깨짐) 가능성을 최소화한다.
- 단원/문제 유형이 달라도 같은 레벨 내부에서는 Day 진행 일관성을 유지한다.
- 홈에서 `jlpt-n1`, `jlpt-n2`를 선택할 수 있게 한다.

## 배경
1. 비ASCII 경로는 환경에 따라 깨질 확률이 높다.
2. 같은 레벨(예: `jlpt-n1`) 안에서 문제2/문제3로 넘어갈 때 Day가 다시 1부터 시작하는 문제를 해결해야 한다.
3. N1/N2 확장 구조를 미리 갖춰야 유지보수가 쉽다.

## 작업 계획
### 1단계: 구조 준비
1. `asset/jlpt-n1`, `asset/jlpt-n2` 루트를 만든다.
2. 각 레벨에 `manifest.json` 초안을 만든다.
3. 경로/파일명 영문 규칙(ASCII, kebab-case)을 확정한다.

### 2단계: 파일 마이그레이션
1. 파일/폴더명은 사용자 수동으로 영문 변경한다.
2. 소스 파일명은 `src.json`으로 통일한다.

### 3단계: Day 일관성 적용
1. 기존 `day`는 로컬 day로 유지한다.
2. 같은 레벨 내부에서만 `day`가 끊기지 않도록 소스 배치/매핑 규칙을 고정한다.
3. 레벨 간(`jlpt-n1` vs `jlpt-n2`) Day는 절대 공유하지 않는다.

### 4단계: 앱 로직 전환
1. 홈에서 `jlpt-n1`, `jlpt-n2`를 선택하도록 UI를 추가한다.
2. 로더는 선택한 레벨의 `manifest.json`만 읽는다.
3. 학습 진행/표시는 기존 `day` 기준을 유지하되, 레벨 선택 컨텍스트 내부에서만 계산한다.

### 5단계: 스크립트/검증 정리
1. validator 기본 대상을 `asset/**/src.json`으로 통일한다.
2. builder 입력은 `--src`만 사용한다.
3. 보고서 파일은 해당 `src.json` 폴더에 생성한다.
4. 기존 `index.json` 하드코딩 참조를 제거한다.

### 6단계: 검증 및 마무리
1. `validate:structure/consistency/choices/reading` 전체 실행
2. 오류 수정 후 재검증
3. 불필요한 구형 스크립트/문서 참조 정리

## 권장 폴더 구조
```text
asset/
  jlpt-n1/
    manifest.json
    vocab/
      chapter-01/
        unit-01/
          source/
            src.json
          output/
            study.json
            build-report.json
    grammar/
      chapter-01/
        unit-01/
          source/
            src.json
          output/
            study.json
            build-report.json
    reading/
      chapter-01/
        unit-01/
          source/
            src.json
          output/
            study.json
            build-report.json

  jlpt-n2/
    manifest.json
    ...
```

## 파일명 규칙
- 경로는 소문자 kebab-case 사용
- 경로에는 ASCII만 허용

## `manifest.json` 예시
`asset/jlpt-n1/manifest.json`

```json
{
  "level": "jlpt-n1",
  "title": "JLPT N1",
  "tracks": [
    {
      "id": "vocab",
      "title": "Vocabulary",
      "chapters": [
        {
          "id": "chapter-01",
          "title": "Chapter 1",
          "units": [
            {
              "id": "unit-01",
              "title": "Unit 1",
              "sourcePath": "vocab/chapter-01/unit-01/source/src.json",
              "outputPath": "vocab/chapter-01/unit-01/output/study.json",
              "dayOffsetStart": 1
            }
          ]
        }
      ]
    }
  ]
}
```

## `src.json` 메타 권장안
```json
{
  "meta": {
    "level": "jlpt-n1",
    "track": "vocab",
    "chapterId": "chapter-01",
    "unitId": "unit-01"
  },
  "days": []
}
```

## Day 일관성 규칙
- `day`: 파일 내부 로컬 day (기존 의미 유지)
- 같은 레벨 내부에서는 `day`가 파일 경계(문제1/문제2/문제3)에서 리셋되지 않도록 manifest 매핑 순서를 고정
- 레벨이 다르면(`jlpt-n1` vs `jlpt-n2`) day 시퀀스는 독립 네임스페이스로 분리

## 앱 변경 포인트
1. 홈: 레벨 선택(`jlpt-n1`, `jlpt-n2`) 추가
2. 로더: 선택 레벨의 `manifest.json`만 읽도록 변경
3. 실제 소스/출력 경로는 manifest 기준으로 resolve
4. 세션 진행/표시는 기존 `day` 필드를 그대로 사용하되, 선택한 레벨 내부에서만 집계

## 스크립트 변경 포인트
1. validator 기본 대상
   - 기존: `asset/**/index.json`
   - 변경: `asset/**/src.json`
2. builder 입력 인자
   - `--src <path>`만 사용
3. report 출력
   - 해당 `src.json`과 같은 폴더
4. 마이그레이션 완료 후 `index.json` 하드코딩 제거

## 마이그레이션 체크리스트
1. `asset/jlpt-n1`, `asset/jlpt-n2` 생성
2. 파일/폴더 영문명 변경
3. manifest 작성
4. output 재생성
5. 검증 실행
   - `npm run validate:structure`
   - `npm run validate:consistency`
   - `npm run validate:choices`
   - `npm run validate:reading`
6. 오류 수정

## 비고
- 파일명 변경 작업은 사용자 수동 작업으로 진행
- 본 문서의 구조/메타 스키마를 목표 계약으로 사용
