# 배포 가이드 (Vercel + Railway + Hugging Face Spaces)

> ⚠️ **두 파이썬 서비스는 서로 다른 곳에 있다.** 헷갈리면 며칠이 날아간다(실제로 그랬다).
> - `image-pipeline` → **Railway**
> - `yolo-server` → **Hugging Face Spaces** (2026-04-29 이전, 커밋 `90f2690`)

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
│  Railway             │  │  Hugging Face Spaces ★   │
│  image-pipeline      │  │  yolo-server             │
│  (FastAPI :8200)     │  │  (FastAPI :8100, docker) │
│  - PDF OCR           │  │  - YOLO 문제 영역 감지   │
│  - 도식 추출/매칭    │  │  - 폴백: GPT-4o Vision   │
│  - index.json (6MB)  │  │  - best.pt (13MB)        │
│                      │  │  snaker1107-gwasaram-yolo│
│                      │  │      .hf.space           │
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

## 2단계: 파이썬 서비스 배포 (image-pipeline=Railway / yolo-server=Hugging Face)

### 2-1. Railway CLI 설치 & 로그인 (image-pipeline 전용)
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

### 2-3. yolo-server — ⚠️ Railway 아님. **Hugging Face Spaces** 다

> 🔴 **이 문서를 보고 Railway 로 갔다가 며칠을 날린 적이 있다.**
> yolo-server 는 **2026-04-29 에 Hugging Face Spaces 로 옮겼는데**(커밋 `90f2690`)
> 이 문서가 4개월간 옛 내용(Railway)으로 남아 있었다. Railway 에 아무리 배포해도
> 운영은 꿈쩍도 안 한다 — 운영이 보는 주소는 아래 HF 주소다.

**운영 주소 (2026-08-30 실측 확인)**
```
https://snaker1107-gwasaram-yolo.hf.space
```
```bash
curl https://snaker1107-gwasaram-yolo.hf.space/health
# {"status":"ok","model_loaded":true,"model_path":"/app/models/best.pt",
#  "class_names":{"0":"problem","1":"graph","2":"table"}}
```

**단일 진실 공급원은 Vercel 환경변수 `YOLO_SERVER_URL` 이다.**
코드는 이 값만 본다(`src/app/api/workflow/detect-problems-yolo/route.ts`,
`src/app/api/cron/yolo-warm/route.ts`). **작업 전에 반드시 먼저 확인할 것:**
```bash
vercel env ls | grep YOLO_SERVER_URL
```

**배포 방법** — HF Space 저장소에 push 하면 Docker 빌드가 자동으로 돈다.
`yolo-server/README.md` 상단 frontmatter(`sdk: docker`, `app_port: 8100`)가 HF Spaces 설정이다.
```bash
cd yolo-server
# HF Space 원격이 등록돼 있어야 한다 (없으면):
#   git remote add space https://huggingface.co/spaces/snaker1107/gwasaram-yolo
git add models/best.pt server.py Dockerfile README.md
git commit -m "update model"
git push space main        # → HF 에서 Docker 빌드 자동 시작
```

**모델 교체(재학습 후)** — `yolo-server/models/best.pt` 를 새 가중치로 바꿔 push 하면 된다.
클래스 순서는 `server.py` 의 `CLASS_NAMES {0:problem, 1:graph, 2:table}` 와 **반드시 일치**해야 한다.

**sleep 주의** — HF Spaces 무료 티어는 유휴 시 잠든다. 6시간마다 핑하는 크론이 있다
(`src/app/api/cron/yolo-warm/route.ts`, 커밋 `afe5af1`). 첫 호출이 느리면 깨어나는 중이다.

**환경변수** — YOLO 서버 자체는 외부 API 호출이 없어 env 불필요.

### 2-4. 헬스 체크
```bash
curl https://<image-pipeline-url>/health          # Railway
curl https://snaker1107-gwasaram-yolo.hf.space/health   # Hugging Face Spaces
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
