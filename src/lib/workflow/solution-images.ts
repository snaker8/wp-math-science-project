// ============================================================================
// 해설 텍스트의 [도형] 마커 → 업로드한 그림 URL 을 `![](url)` 로 박는다.
//   해설은 problems.solution_latex 한 칸에 저장되고, MixedContentRenderer 가 `![](url)` 을
//   그림으로 그린다. 본문처럼 images[] 배열에 따로 두면 해설 쪽 렌더러가 위치를 모른다.
//   업로드 실패한 그림은 마커를 지운다 — 「[도형]」 글자가 화면에 새는 것보다 낫다.
// ============================================================================

export async function materializeSolution(
  text: string,
  images: string[],
  upload: (dataUrl: string, index: number) => Promise<string | null>,
): Promise<string> {
  if (!text) return '';
  const urls: (string | null)[] = [];
  for (let i = 0; i < images.length; i++) urls.push(await upload(images[i], i));
  let k = 0;
  return text
    .replace(/\[도형\]/g, () => {
      const url = urls[k++];
      return url ? `\n![](${url})\n` : '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
