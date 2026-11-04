FROM python:3.12-slim
WORKDIR /app
COPY monitor.py .
ENV PYTHONUNBUFFERED=1 TER_RUNTIME_DIR=/data TER_THRESHOLD=126 TER_INTERVAL_SECONDS=15
# Public API collection needs only Python's standard library, no browser/login.
CMD ["python", "monitor.py", "--no-alerts"]
