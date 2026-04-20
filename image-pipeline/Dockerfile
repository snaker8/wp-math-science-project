# image-pipeline FastAPI 서버 Dockerfile
# Railway / Fly.io / Render 등에 배포 가능
# 주의: dasaram_diagram_db/images/ (3.1GB)는 제외 — 이미지는 Supabase Storage 사용

FROM python:3.11-slim

WORKDIR /app

# PyMuPDF, Pillow, olefile 등의 시스템 의존성
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg-dev zlib1g-dev libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스 코드 + index.json 포함 (images/ 는 .dockerignore로 제외)
COPY . .

# Railway 등 PaaS는 $PORT 환경변수로 포트 주입
ENV PORT=8200
EXPOSE 8200

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8200} --timeout-keep-alive 120
