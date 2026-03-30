/**
 * GET /api/diagram-images/proxy?path=images/science/xxx/page004_enhanced.png
 * 로컬 diagram DB 이미지 파일을 직접 서빙
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// 이미지 파이프라인 DB 루트 (프로젝트 내 image-pipeline/dasaram_diagram_db/)
const DB_ROOT = path.join(process.cwd(), 'image-pipeline', 'dasaram_diagram_db');

export async function GET(request: NextRequest) {
  const filepath = request.nextUrl.searchParams.get('path');
  if (!filepath) {
    return NextResponse.json({ error: 'path required' }, { status: 400 });
  }

  // 경로 순회 공격 방지 + 백슬래시→슬래시 정규화
  const normalized = path.normalize(filepath.replace(/\\/g, '/')).replace(/\.\./g, '');
  const absPath = path.join(DB_ROOT, normalized);

  // DB_ROOT 밖으로 벗어나는지 확인
  if (!absPath.startsWith(DB_ROOT)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  if (!existsSync(absPath)) {
    return NextResponse.json({ error: 'Image not found', path: normalized }, { status: 404 });
  }

  try {
    const buffer = await readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read image' }, { status: 500 });
  }
}
