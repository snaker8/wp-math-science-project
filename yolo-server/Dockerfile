FROM python:3.11-slim

WORKDIR /app

# OpenCV 의존성 (ultralytics에 필요)
# ★ Debian 13(trixie)에서 libgl1-mesa-glx 패키지가 제거됨 → libgl1 사용
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# ★ 한 번의 pip install로 통합 — pip resolver가 CPU torch를 모든 의존성에 일관되게 적용
# 분리 설치 시 ultralytics가 CUDA torch 재설치 시도 → 빌드 실패
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    torch==2.4.1+cpu torchvision==0.19.1+cpu \
    -r requirements.txt

COPY . .

ENV PORT=8100
EXPOSE 8100

# Railway 등 PaaS는 $PORT 환경변수로 포트 주입
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8100}
