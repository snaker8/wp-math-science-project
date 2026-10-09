// ============================================================================
// 인쇄 DOM(#exam-print-root) → 독립 HTML 문서 직렬화 (클라이언트)
//
// ★ 2026-10-10 PDF 다운로드용. ExamPaperView.doPrint 가 만드는 복제 DOM 을 그대로 받아
//   현재 페이지의 모든 스타일(Tailwind 링크·styled-jsx <style>·KaTeX·Pretendard @font-face)을 함께 담는다.
//   서버 헤드리스 크롬은 로그인 쿠키가 없으므로
//   - 스타일시트는 텍스트를 받아 인라인 (url() 상대경로는 절대경로로 고쳐 KaTeX·Pretendard 폰트가 그대로 로드)
//   - 그림(<img>)은 data URL 로, <canvas> 는 PNG data URL <img> 로 바꾼다 (프록시 경로·Supabase 공개 URL 모두)
//   화면·인쇄 코드는 손대지 않는다.
// ============================================================================

const absolutize = (url: string, base: string): string => {
  try { return new URL(url, base).href; } catch { return url; }
};

/** CSS 텍스트 안의 url(...) 을 시트 위치 기준 절대 URL 로 */
function rewriteCssUrls(css: string, sheetHref: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q: string, u: string) => {
    if (/^(data:|blob:|https?:|\/\/)/i.test(u)) return m;
    return `url(${q}${absolutize(u, sheetHref)}${q})`;
  });
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** 현재 문서의 스타일을 모두 모아 <head> 에 넣을 HTML 로 */
async function collectStyles(): Promise<string> {
  const parts: string[] = [];
  const nodes = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'));
  for (const node of nodes) {
    if (node instanceof HTMLLinkElement) {
      const href = absolutize(node.getAttribute('href') || '', location.href);
      if (!href) continue;
      const css = await fetchText(href);
      if (css !== null) parts.push(`<style data-from="${href}">${rewriteCssUrls(css, href)}</style>`);
      else parts.push(`<link rel="stylesheet" href="${href}">`);
    } else {
      // styled-jsx: 요소 class(jsx-xxx) 와 짝 — 텍스트 그대로
      const attrs = Array.from(node.attributes).map((a) => `${a.name}="${a.value.replace(/"/g, '&quot;')}"`).join(' ');
      parts.push(`<style ${attrs}>${node.textContent || ''}</style>`);
    }
  }
  return parts.join('\n');
}

/** 복제 루트 안의 그림을 자급자족 형태로 (img→data URL, canvas→img, lazy→eager) */
async function embedImages(root: HTMLElement): Promise<void> {
  // canvas → img (원본 DOM 의 canvas 와 짝 맞추기: cloneNode 는 픽셀을 복제하지 않는다)
  const canvases = Array.from(root.querySelectorAll('canvas'));
  for (const c of canvases) {
    try {
      const img = document.createElement('img');
      img.src = c.toDataURL('image/png');
      img.width = c.width; img.height = c.height;
      img.setAttribute('style', c.getAttribute('style') || '');
      img.className = c.className;
      c.replaceWith(img);
    } catch { /* tainted canvas — 그대로 둔다 */ }
  }
  const imgs = Array.from(root.querySelectorAll('img'));
  const cache = new Map<string, string | null>();
  await Promise.all(imgs.map(async (img) => {
    img.loading = 'eager';
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;
    const abs = absolutize(src, location.href);
    if (!cache.has(abs)) cache.set(abs, await toDataUrl(abs));
    const data = cache.get(abs);
    img.setAttribute('src', data || abs);
  }));
}

/**
 * #exam-print-root 요소 → 완성 HTML 문서 문자열.
 * 호출측은 루트를 body 에 붙이지 않아도 된다(복제본만 있으면 됨).
 */
export async function serializePrintDocument(printRoot: HTMLElement, title: string): Promise<string> {
  const root = printRoot.cloneNode(true) as HTMLElement;
  await embedImages(root);
  const styles = await collectStyles();
  const htmlEl = document.documentElement;
  const htmlAttrs = Array.from(htmlEl.attributes)
    .filter((a) => a.name !== 'style')
    .map((a) => `${a.name}="${a.value.replace(/"/g, '&quot;')}"`).join(' ');
  const bodyClass = document.body.className.replace(/"/g, '&quot;');
  const safeTitle = title.replace(/[<>&]/g, ' ');
  return `<!DOCTYPE html>
<html ${htmlAttrs}>
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<base href="${location.origin}/">
${styles}
<style>
  /* PDF 전용 — 화면 전역 배경·여백 제거 (인쇄 미디어 규칙은 문서가 가진 @media print 가 담당) */
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
</style>
</head>
<body class="${bodyClass}">
${root.outerHTML}
</body>
</html>`;
}
