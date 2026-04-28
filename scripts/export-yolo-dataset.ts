/**
 * YOLO 학습용 dataset export
 *
 * detection_annotations(MANUAL) + Supabase Storage page-images 를 YOLOv8 학습 dataset 으로 변환.
 *
 * 출력 구조:
 *   yolo-dataset/
 *     images/
 *       train/   (80%)
 *       val/     (20%)
 *     labels/
 *       train/
 *       val/
 *     data.yaml
 *
 * 사용법:
 *   npx tsx scripts/export-yolo-dataset.ts
 *   (출력 폴더 → Colab/로컬 GPU 에서 `yolo train data=data.yaml model=yolov8n.pt epochs=80 imgsz=1024`)
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ .env.local 에 SUPABASE_URL / SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const OUT_DIR = path.resolve('yolo-dataset');
const VAL_RATIO = 0.2;
const STORAGE_BUCKET = 'source-files';
const CLASS_NAMES = ['problem']; // 단일 클래스. 추후 multi-class 확장 시 여기 추가.

interface AnnotationRow {
  page_image_path: string;
  page_width: number;
  page_height: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  class_label: string;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function flatFilenameFromPath(storagePath: string): string {
  // page-images/<jobId>/page-3.png → <jobId>_page-3.png  (충돌 방지)
  return storagePath.replace(/^page-images\//, '').replace(/\//g, '_');
}

async function downloadImage(storagePath: string, dest: string): Promise<boolean> {
  if (fs.existsSync(dest)) return true; // 이미 받은 건 skip
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
    if (error || !data) {
      console.warn(`  ⚠ download fail: ${storagePath} ${error?.message ?? ''}`);
      return false;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return true;
  } catch (e) {
    console.warn(`  ⚠ download exception: ${storagePath}`, e);
    return false;
  }
}

async function fetchAllAnnotations(): Promise<AnnotationRow[]> {
  // detection_annotations 전체 페이지네이션 (supabase 기본 1000건 한도)
  const all: AnnotationRow[] = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('detection_annotations')
      .select('page_image_path, page_width, page_height, bbox_x, bbox_y, bbox_w, bbox_h, class_label')
      .eq('detection_source', 'MANUAL')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as AnnotationRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

(async () => {
  console.log('📦 YOLO dataset export 시작\n');

  // 1) annotation 전체 가져오기
  const rows = await fetchAllAnnotations();
  console.log(`✓ annotation: ${rows.length} 건`);

  // 2) page_image_path 기준 그룹핑
  const pageMap = new Map<string, AnnotationRow[]>();
  for (const r of rows) {
    if (!r.page_image_path) continue;
    if (!pageMap.has(r.page_image_path)) pageMap.set(r.page_image_path, []);
    pageMap.get(r.page_image_path)!.push(r);
  }
  console.log(`✓ unique pages: ${pageMap.size}`);

  // 3) train/val split (페이지 기준 — 같은 페이지 bbox 가 train·val 나뉘면 누수)
  const pages = Array.from(pageMap.keys());
  // 결정적 split — page_image_path 의 hash 로 정렬해 매번 같은 결과 나오게
  pages.sort();
  // 시드 기반 shuffle
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = pages.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pages[i], pages[j]] = [pages[j], pages[i]];
  }
  const valCount = Math.max(1, Math.floor(pages.length * VAL_RATIO));
  const valSet = new Set(pages.slice(0, valCount));
  console.log(`✓ split: train ${pages.length - valCount} / val ${valCount}\n`);

  // 4) 디렉토리 준비
  ensureDir(path.join(OUT_DIR, 'images', 'train'));
  ensureDir(path.join(OUT_DIR, 'images', 'val'));
  ensureDir(path.join(OUT_DIR, 'labels', 'train'));
  ensureDir(path.join(OUT_DIR, 'labels', 'val'));

  // 5) 각 페이지: 이미지 다운로드 + 라벨 파일 생성
  let imgOk = 0, imgFail = 0, bboxTotal = 0;
  let idx = 0;
  for (const pagePath of pages) {
    idx++;
    const split = valSet.has(pagePath) ? 'val' : 'train';
    const filename = flatFilenameFromPath(pagePath); // 예: <jobId>_page-3.png
    const stem = filename.replace(/\.[^.]+$/, '');
    const imgDest = path.join(OUT_DIR, 'images', split, filename);
    const labelDest = path.join(OUT_DIR, 'labels', split, `${stem}.txt`);

    process.stdout.write(`[${idx}/${pages.length}] ${split} ${stem.slice(0, 40)}... `);

    // 이미지 다운로드
    const ok = await downloadImage(pagePath, imgDest);
    if (!ok) { imgFail++; console.log('SKIP'); continue; }
    imgOk++;

    // 라벨 파일 (YOLO format: class cx cy w h, 모두 0~1 정규화)
    const annots = pageMap.get(pagePath)!;
    const lines: string[] = [];
    for (const a of annots) {
      const classIdx = CLASS_NAMES.indexOf(a.class_label);
      if (classIdx < 0) continue; // 알 수 없는 라벨 skip
      // 우리 bbox: 좌상단(x,y) + w/h, 모두 0~1 정규화 (sample 확인)
      // YOLO: 중심(cx,cy) + w/h
      const cx = a.bbox_x + a.bbox_w / 2;
      const cy = a.bbox_y + a.bbox_h / 2;
      // clamp 0~1 (수치 안전)
      const safe = (v: number) => Math.max(0, Math.min(1, v));
      lines.push(`${classIdx} ${safe(cx).toFixed(6)} ${safe(cy).toFixed(6)} ${safe(a.bbox_w).toFixed(6)} ${safe(a.bbox_h).toFixed(6)}`);
      bboxTotal++;
    }
    fs.writeFileSync(labelDest, lines.join('\n') + (lines.length ? '\n' : ''), 'utf-8');
    console.log(`OK (${lines.length} bbox)`);
  }

  // 6) data.yaml
  const yamlContent = [
    `# YOLOv8 dataset config (auto-generated)`,
    `path: ${OUT_DIR.replace(/\\/g, '/')}`,
    `train: images/train`,
    `val: images/val`,
    ``,
    `nc: ${CLASS_NAMES.length}`,
    `names:`,
    ...CLASS_NAMES.map((n, i) => `  ${i}: ${n}`),
    ``,
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'data.yaml'), yamlContent, 'utf-8');

  console.log('\n📊 결과:');
  console.log(`  - 이미지: ${imgOk} 다운로드 / ${imgFail} 실패`);
  console.log(`  - bbox  : ${bboxTotal} 건`);
  console.log(`  - 출력  : ${OUT_DIR}`);
  console.log('\n✅ 다음 단계 (Colab/로컬 GPU):');
  console.log('  pip install ultralytics');
  console.log(`  yolo train data=${OUT_DIR.replace(/\\/g, '/')}/data.yaml model=yolov8n.pt epochs=80 imgsz=1024 batch=8`);
})();
