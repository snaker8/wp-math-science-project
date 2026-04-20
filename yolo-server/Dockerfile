FROM python:3.11-slim

WORKDIR /app

# OpenCV 의존성 (ultralytics에 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8100
EXPOSE 8100

# Railway 등 PaaS는 $PORT 환경변수로 포트 주입
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8100}
