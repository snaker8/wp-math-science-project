# 배포 가이드 (Vercel + Railway)

## 아키텍처

```
┌─────────────────────────────────────────────────────┐
│  Vercel (Next.js)                                   │
│  - suzag-math.vercel.app (또는 커스텀 도메인)         │
│  - 환경변수 14개                                     │
└────────────┬────────────────────┬───────────────────┘
             │                    │
             ▼                    ▼
┌─────────────────────┐  ┌──────────────────────────┐
│  Railway             │  │  Railway                 │
│  image-pipeline      │  │  yolo-server             │
│  (FastAPI :8200)     │  │  (FastAPI :8100)         │
│  - PDF OCR           │  │  - YOLO 문제 영역 감지   │
│  - 도식 추출/매칭    │  │  - 폴백: GPT-4o Vision   │
│  - index.json (6MB)  │  │  - best.pt (13MB)        │
└──────────┬───────────┘  └──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Supabase (기존)                     │
│  - Postgres DB                       │
│  - Auth                              │
│  - Storage (diagram-images 3,390개)  │
└─────────────────────────────────────┘
```

## 1단계: 다이어그램 DB 업로드 (배포 전 1회만)

```bash
cd image-pipeline
python bulk_upload_to_supabase.py --resume
```
- 3,390개 이미지를 Supabase Storage에 업로드
- `dasaram_diagram_db/index.json`에 `public_url` 추가
- `upload_checkpoint.json`으로 resume 지원

진행 상황 확인 (Supabase MCP):
```sql
SELECT subject, COUNT(*) FROM diagram_images GROUP BY subject;
```

## 2단계: Railway 배포

### 2-1. CLI 설치 & 로그인
```bash
npm i -g @railway/cli
railway login
```

### 2-2. image-pipeline 서비스
```bash
cd image-pipeline
railway init              # 새 프로젝트 "과사람-image-pipeline"
railway up                # Dockerfile 감지 → 자동 빌드
railway domain            # 퍼블릭 URL 발급
```

**환경변수 등록 (Railway 대시보드 → Variables):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

### 2-3. yolo-server 서비스
```bash
cd ../yolo-server
railway init              # 별도 프로젝트 "과사람-yolo"
railway up
railway domain            # 퍼블릭 URL 발급
```

**환경변수** — YOLO 서버는 외부 API 호출 없음, env 필요 없음

### 2-4. 헬스 체크
```bash
curl https://<image-pipeline-url>/health
curl https://<yolo-url>/health
```

## 3단계: Vercel 배포

### 3-1. CLI 설치 & 로그인
```bash
npm i -g vercel
vercel login
```

### 3-2. 프로젝트 링크
```bash
cd "C:\과사람 프로젝트\과사람 수학프로그램"
vercel link
# Yes, link to existing project or create new
```

### 3-3. 환경변수 등록
Vercel 대시보드 → Settings → Environment Variables → Production

| 변수명 | 값 |
|-------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (민감) |
| `OPENAI_API_KEY` | |
| `ANTHROPIC_API_KEY` | |
| `GOOGLE_AI_KEY` | |
| `ZAI_API_KEY` | |
| `MATHPIX_APP_ID` | |
| `MATHPIX_APP_KEY` | |
| `NEXT_PUBLIC_APP_URL` | `https://yourdomain.vercel.app` |
| `NODE_ENV` | `production` |
| **`NEXT_PUBLIC_IMAGE_PIPELINE_URL`** | Railway image-pipeline URL (클라이언트용) |
| **`IMAGE_PIPELINE_URL`** | 동일한 Railway URL (서버용, API routes가 사용) |
| **`YOLO_SERVER_URL`** | Railway yolo-server URL |
| `YOLO_CONFIDENCE_THRESHOLD` | `0.25` (선택) |
| `YOLO_TIMEOUT_MS` | `10000` (선택) |

### 3-4. 배포
```bash
# 프리뷰 배포
vercel

# 프로덕션 배포
vercel --prod
```

## 4단계: 검증

### 4-1. 핵심 기능 체크
- [ ] 로그인 (Supabase Auth)
- [ ] PDF 업로드 → OCR 분석
- [ ] 도식 추출 (image-pipeline Railway 호출)
- [ ] AI 문제 영역 감지 (YOLO Railway 호출)
- [ ] 문제은행 검색
- [ ] 시험지 생성/인쇄

### 4-2. 로그 확인
```bash
# Vercel 로그
vercel logs

# Railway 로그
railway logs --tail
```

## 트러블슈팅

### Python 서버 콜드 스타트 (Railway Free 플랜)
- Railway 무료 플랜은 30분 유휴 시 슬립
- 첫 요청 시 15~30초 지연 발생
- **해결**: Pro 플랜 ($5/월) 또는 cron ping
  ```bash
  # 5분마다 헬스 체크 (Vercel Cron 추천)
  */5 * * * * curl https://image-pipeline-xxx.railway.app/health
  ```

### CORS 에러
- 브라우저가 Railway URL 직접 호출 시 CORS 필요
- `image-pipeline/server.py` + `yolo-server/server.py` CORS 미들웨어 확인
- 현재 FastAPI 기본값: Next.js 서버에서 호출이라 브라우저 CORS 무관

### Supabase Storage RLS
- `diagram-images` 버킷 public 접근 설정 확인
- `supabase_uploader.py`에서 `public: True` 로 생성함

## 비용 예상 (MVP, 월 기준)

| 서비스 | 프리 티어 | 예상 $ |
|-------|---------|--------|
| Vercel Hobby | 무료 | $0 |
| Railway (2서비스) | $5 크레딧 | $5~20 |
| Supabase (Free) | 무료 | $0 |
| Supabase Pro (권장) | | $25 |
| **합계** | | **$30~50/월** |

+ AI API 사용량:
- OpenAI GPT-4o: 분류 + Vision 폴백 → 사용자당 약 $0.5~2
- Anthropic Claude Sonnet: 해설 생성 → 사용자당 약 $1~3
- Mathpix: 페이지당 $0.003 × 응시 수

## 점진 개선 로드맵

1. **즉시**: 이 문서 순서대로 배포
2. **1주차**: 모니터링 (Sentry, Logflare)
3. **2주차**: 커스텀 도메인 + HTTPS
4. **1개월**: 조직/권한 모델, 학원별 데이터 격리
5. **2개월**: 결제 통합 (Stripe), 사용량 쿼터
6. **3개월**: Python 서버 Autoscale, Redis 캐시
