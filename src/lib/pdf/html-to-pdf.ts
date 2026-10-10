// ============================================================================
// HTML → PDF (서버, 헤드리스 크롬)
//
// ★ 2026-10-10 대표: "우리도 PDF 다운 버튼 만들자. 인쇄 들어가 하지 말고 매쓰홀릭처럼."
//   시험지 출력은 화면의 .exam-page DOM 을 복제해 window.print() 하는 구조(ExamPaperView.doPrint).
//   같은 복제 DOM(+스타일)을 그대로 받아 크롬 인쇄 엔진으로 PDF 를 만든다 → 브라우저 「PDF 로 저장」과
//   같은 벡터 PDF, 화면 = 인쇄 = PDF. 인쇄 파이프라인은 건드리지 않는다(불가침).
//
//   - Vercel(linux): @sparticuz/chromium (람다용 크롬) + puppeteer-core
//   - 로컬(win32/mac): 시스템 크롬 (PUPPETEER_EXECUTABLE_PATH 로 덮어쓰기 가능)
//
// ★ 2026-10-11 한글 누락 사고: 람다 크롬엔 한글 시스템 글꼴이 없고(OpenSans 뿐) Pretendard 웹폰트가 안 실려
//   PDF 에 한글이 통째로 빠졌다(대표 캡처). 번들한 Pretendard OTF(assets/fonts, SVG 래스터와 공용)를 크롬의
//   fontconfig 폴더에 복사해 **시스템 글꼴**로 깔아 둔다 — 웹폰트가 실패해도 'Pretendard' 로 폴백된다.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'puppeteer-core';

const LOCAL_CHROME_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

/** 번들 글꼴(assets/fonts/*.otf)을 크롬 fontconfig 폴더에 복사 — 한 번만, 실패해도 PDF 는 계속 */
function installBundledFonts(): string[] {
  const installed: string[] = [];
  try {
    const srcDir = path.join(process.cwd(), 'assets', 'fonts');
    if (!fs.existsSync(srcDir)) return installed;
    const destDir = process.env.FONTCONFIG_PATH || path.join(require('node:os').tmpdir(), 'fonts');
    if (path.resolve(destDir) === path.resolve(srcDir)) return ['(FONTCONFIG_PATH=assets/fonts)'];
    fs.mkdirSync(destDir, { recursive: true });
    for (const f of fs.readdirSync(srcDir)) {
      if (!/\.(otf|ttf|woff2?)$/i.test(f)) continue;
      const dest = path.join(destDir, f);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(srcDir, f), dest);
      installed.push(dest);
    }
  } catch (e) {
    console.warn('[html-to-pdf] 번들 글꼴 설치 실패(계속 진행):', e instanceof Error ? e.message : e);
  }
  return installed;
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer-core');
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (!isServerless) {
    const candidates = envPath ? [envPath] : (LOCAL_CHROME_CANDIDATES[process.platform] || []);
    const found = candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
    if (found) {
      return puppeteer.launch({
        executablePath: found,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
      });
    }
    // 로컬에 크롬이 없으면 람다용 크롬으로 폴백 (linux 에서만 동작)
  }

  const chromium = (await import('@sparticuz/chromium')).default;
  const executablePath = await chromium.executablePath(); // fonts.tar 를 /tmp/fonts 에 풀고 FONTCONFIG_PATH 를 정한다
  const fonts = installBundledFonts();
  console.log(`[html-to-pdf] 번들 글꼴 ${fonts.length}개 (${process.env.FONTCONFIG_PATH || '-'})`);
  return puppeteer.launch({
    args: [...chromium.args, '--font-render-hinting=none'],
    executablePath,
    headless: true,
    defaultViewport: { width: 1200, height: 1600, deviceScaleFactor: 1 },
  });
}

export interface HtmlToPdfOptions {
  /** 페이지 로드·폰트·이미지 대기 상한(ms) */
  timeoutMs?: number;
}

type PageLike = Awaited<ReturnType<Browser['newPage']>>;

async function loadAndSettle(page: PageLike, html: string, timeout: number) {
  await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout } as Parameters<PageLike['setContent']>[1]);
  // 폰트(Pretendard·KaTeX) 로드 완료 — 안 기다리면 수식 폭이 깨진 채 찍힌다 (doPrint 의 fonts.ready 와 동일)
  await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
  // 이미지 디코드 완료
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }))));
  });
}

/**
 * 완성된 HTML 문서(스타일 포함)를 A4 PDF 로.
 * - print 미디어로 렌더(puppeteer page.pdf 기본) → ExamPaperView 의 @media print 규칙이 그대로 적용.
 * - @page { size: A4; margin: 0 } 을 문서가 들고 있으므로 preferCSSPageSize.
 */
export async function htmlToPdf(html: string, opts: HtmlToPdfOptions = {}): Promise<Buffer> {
  const timeout = opts.timeoutMs ?? 60_000;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await loadAndSettle(page, html, timeout);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout,
    });
    return Buffer.from(pdf);
  } finally {
    try { await browser.close(); } catch { /* ignore */ }
  }
}

/** ★ 진단 — 같은 문서를 띄워 글꼴 로드 상태·글꼴 요청 결과·실제 쓰인 글꼴을 돌려준다 (PDF 안 만듦) */
export async function debugFonts(html: string, opts: HtmlToPdfOptions = {}): Promise<Record<string, unknown>> {
  const timeout = opts.timeoutMs ?? 60_000;
  const browser = await launchBrowser();
  const requests: Array<{ url: string; status: number | string }> = [];
  try {
    const page = await browser.newPage();
    page.on('response', (res) => { const u = res.url(); if (/\.(woff2?|otf|ttf)(\?|$)/i.test(u)) requests.push({ url: u.slice(-70), status: res.status() }); });
    page.on('requestfailed', (req) => { requests.push({ url: req.url().slice(-70), status: `FAIL ${req.failure()?.errorText || ''}` }); });
    await loadAndSettle(page, html, timeout);
    const fonts = await page.evaluate(() => {
      const fs = (document as unknown as { fonts: Iterable<{ family: string; status: string; weight: string; unicodeRange: string }> }).fonts;
      const out: Array<{ family: string; status: string; weight: string }> = [];
      for (const f of fs) if (f.status !== 'unloaded') out.push({ family: f.family, status: f.status, weight: f.weight });
      return out;
    });
    // 한글 글리프가 실제로 그려지는지 — 캔버스로 폭 측정 (시스템 폴백 포함)
    const glyph = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('2d');
      if (!c) return null;
      const w = (font: string, s: string) => { c.font = font; return c.measureText(s).width; };
      return { pretendard: w("16px 'Pretendard Variable', Pretendard", '가나다'), sans: w('16px sans-serif', '가나다'), serif: w('16px serif', '가나다'), latin: w('16px sans-serif', 'abc') };
    });
    return { fontconfigPath: process.env.FONTCONFIG_PATH, bundled: installBundledFonts(), fonts, requests: requests.slice(0, 40), glyph };
  } finally {
    try { await browser.close(); } catch { /* ignore */ }
  }
}
