// 테두리/조건 박스(isChoiceTabular)를 각 조건 줄로 변환하는 순수 함수.
// MixedContentRenderer(.tsx)에서 분리 — vitest 가 직접 import 해 실제 코드를 테스트(복제 drift 방지).

// ★ 테두리/조건 박스(isChoiceTabular) → 각 조건 줄로 변환. 실제 렌더 경로 = 이 함수(테스트도 이걸 직접 호출).
//   중첩 행렬/cases 는 MTX 마커로 보호 후 복원(동인고 #16). 복원 정규식은 [0-9]+ — '\\d' 이스케이프 함정 회피.
export function convertChoiceTabularBox(m: string): string {
  // ★ 중첩 수식 환경(matrix/cases/aligned) 보호 — 박스 안 행렬의 & · \ 가 셀구분·줄바꿈 변환에
  //   파괴되면 행렬이 통째 깨짐(동인고 #16: (가)(나) 조건의 $A\left(\begin{matrix}...\right)$). 끝에 복원.
  const MTX = String.fromCharCode(1);
  const nestedEnvs: string[] = [];
  const mProtected = m.replace(
    /\\begin\{((?:p|b|v|B|V)?matrix|cases|aligned)\}[\s\S]*?\\end\{\1\}/g,
    (env) => { nestedEnvs.push(env); return MTX + (nestedEnvs.length - 1) + MTX; }
  );
  // tabular → 각 보기를 개별 줄로 변환
  let converted = mProtected
    .replace(/\\begin\{(?:tabular|array)\}(?:\{[^}]*\})?/, '') // 시작 태그 제거
    .replace(/\\end\{(?:tabular|array)\}/, '')                  // 끝 태그 제거
    // ★ 테두리 조건박스({|c|}+\hline)도 isChoiceTabular 로 올 수 있음(#390 이후) — \hline 안 빼면
    //   변환 결과에 raw "\hline" 노출(예문여고 #16). 풀이박스 경로(line 255)와 동일하게 제거.
    .replace(/\\hline\s*/g, ' ')
    .replace(/\s*###\s*/g, ' ')                                 // ### → 공백
    .replace(/\s*\\\\\s*/g, '\n')                               // \\ → 줄바꿈 (공백 아님!)
    .replace(/\s*&\s*/g, ' ')                                   // & → 공백
    .replace(/<?\s*보기\s*>?\s*/g, '')                          // <보기> 잔여 제거
    .replace(/\\quad\s*/g, ' ')                                 // \quad → 공백
    .trim();
  // ★ 1단계: \text{...} 래퍼 벗기기 (내용만 추출)
  converted = converted.replace(/\\text\s*\{([^}]*)\}/g, '$1');
  // ★ 2단계: 가./나./다./라./마. → ㄱ./ㄴ./ㄷ./ㄹ./ㅁ.
  //   ★ 음수 룩비하인드 (?<![가-힣A-Za-z0-9(（]) 필수:
  //     - 문장 끝 "…이다." "…가진다." 의 "다." 를 라벨로 오인 금지(유령 ㄷ. + 잘림, 예문여고 #16/#409).
  //     - ★ "(" "（" 도 제외 — 원본이 괄호 음절 라벨 `(가) (나) (다)` 이면 그대로 보존해야 함.
  //       (안 막으면 "(가)"→"(ㄱ)" 로 바꾸고 line 299 가 "("+"ㄱ)" 로 쪼개 단독 "(" 노출. 예문여고 #16 원본=괄호형)
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])가\s*([.)])/g, 'ㄱ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])나\s*([.)])/g, 'ㄴ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])다\s*([.)])/g, 'ㄷ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])라\s*([.)])/g, 'ㄹ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])마\s*([.)])/g, 'ㅁ$1');
  // 마침표 없는 가/나/다 단독 → ㄱ/ㄴ/ㄷ (뒤에 수식이 바로 오는 경우)
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])가(?=\s*[\$y\\])/g, 'ㄱ.');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])나(?=\s*[\$y\\])/g, 'ㄴ.');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])다(?=\s*[\$y\\])/g, 'ㄷ.');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])라(?=\s*[\$y\\])/g, 'ㄹ.');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9])마(?=\s*[\$y\\])/g, 'ㅁ.');
  // OCR 오인: c. → ㄷ.
  converted = converted.replace(/\bc\s*([.)])/g, 'ㄷ$1');
  // 각 보기 라벨 앞에 줄바꿈 → 개별 줄로 분리
  converted = converted.replace(/([ㄱㄴㄷㄹㅁ])\s*([.)])/g, '\n$1$2');
  // ★ 단독 "(" / ")" 줄 제거 — 테두리 박스의 \hline 옆 OCR 잔재가 단독 괄호로 남아
  //   각 조건 앞·박스 위에 "(" 한 글자로 노출되던 사고(예문여고 #16). 줄 전체가 괄호 1개뿐일 때만.
  converted = converted.replace(/(^|\n)[ \t]*[\(（\)）][ \t]*(?=\n|$)/g, '$1');
  converted = converted.replace(/\n{2,}/g, '\n');
  // 보호한 중첩 수식 환경 복원(MTX 마커 → 원본 행렬/cases)
  converted = converted.replace(new RegExp(MTX + '([0-9]+)' + MTX, 'g'), (_m, ix) => nestedEnvs[Number(ix)] || '');
  return '\n' + converted.trim() + '\n';
}
