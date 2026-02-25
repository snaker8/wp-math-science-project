# GLM 모델 테스트 가이드

기존 코드를 **전혀 건드리지 않고** 별도 스크립트로 GLM 모델을 테스트합니다.

---

## 0. 사전 준비: Z.AI API 키 발급

1. https://bigmodel.cn/ 또는 https://z.ai 접속
2. 회원가입 후 API Keys 메뉴
3. 새 키 생성

### .env 파일에 추가
```
ZAI_API_KEY=your_zai_api_key_here
```

---

## 1. 분류 테스트 (GPT-4o vs GLM-4.7 Flash)

**무엇을 테스트하나?**
- 동일한 한국 수학 문제 5개를 두 모델에게 분류시킴
- 과목, 단원, 난이도 정확도 비교
- 한국어 프롬프트 vs 영어 프롬프트도 비교

```bash
npx ts-node scripts/test-glm-classify.ts
```

**판단 기준:**
- GLM 정확도 ≥ GPT-4o → 분류 API 교체 (비용 0원)
- GLM 정확도가 1개 차이 → 프롬프트 튜닝 후 재테스트
- GLM 정확도 < GPT-4o -1 → GPT-4o 유지

---

## 2. 문제 감지 테스트 (GPT-4o Vision vs GLM-4.6V)

**무엇을 테스트하나?**
- PDF 페이지 이미지에서 각 문제의 위치(바운딩 박스) 감지
- 기존 GPT-4o Vision과 동일한 프롬프트로 GLM-4.6V 비교

### 테스트 이미지 준비
PDF 페이지를 PNG로 변환 (예: Adobe Acrobat, ILovePDF 등)
- 권장 해상도: 150~200 DPI (약 1240×1754 ~ 1654×2339 px)
- 너무 크면 (>5MB) 압축 필요

```bash
npx ts-node scripts/test-glm-detect.ts 경로/시험지페이지.png
```

**판단 기준:**
- 감지 문제 수가 실제와 일치하는가?
- 바운딩 박스 좌표가 합리적인가? (y값 순서, 크기 등)
- 헤더/여백을 잘못 감지하지 않는가?

---

## 3. 그래프/표 재현 테스트 (GLM-4.6V → Desmos)

**무엇을 테스트하나?**
- 그래프 이미지 → GLM-4.6V → Desmos 수식 생성
- LaTeX 수식을 알고 있으면 → GLM-4.7 Flash로 수학 검증

### 기본 (이미지만)
```bash
npx ts-node scripts/test-glm-graph.ts 경로/그래프이미지.png
```

### 검증 포함 (이미지 + 원래 LaTeX 수식)
```bash
npx ts-node scripts/test-glm-graph.ts 경로/그래프이미지.png "y=-x^2+8x-12"
```

**결과 확인:**
1. 생성된 Desmos 수식을 https://www.desmos.com/calculator 에 붙여넣기
2. 원본 그래프와 시각적으로 비교
3. GLM-4.7 검증 결과의 x절편/꼭짓점이 올바른지 확인

**판단 기준:**
- Desmos 수식이 렌더링되는가? (문법 오류 없음)
- 그래프 형태(포물선/직선 등)가 맞는가?
- 절편, 꼭짓점이 80% 이상 정확한가?

---

## 테스트 결과에 따른 적용 계획

| 테스트 결과 | 다음 단계 |
|------------|-----------|
| 분류 ✅ | `cloud-flow.ts` API를 GLM-4.7 Flash로 교체 |
| 감지 ✅ | `detect-problems/route.ts`에 GLM-4.6V 옵션 추가 |
| 그래프 ✅ (80%+) | 자동 그래프 생성 파이프라인 구현 |
| 그래프 ⚠️ (50~80%) | Fallback 포함해서 시범 적용 |
| 그래프 ❌ (<50%) | 수동 유지, 다른 접근 검토 |

---

## 참고: 모델별 비용

| 모델 | 비용 |
|------|------|
| glm-4.7-flash | **무료** (Z.AI 공식) |
| glm-4.6v-flash | **무료** (Z.AI 공식) |
| gpt-4o | $2.50/$10.00 per 1M tokens |
