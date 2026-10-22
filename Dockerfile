FROM mcr.microsoft.com/playwright/python:v1.55.0-noble
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY monitor.py .
ENV PYTHONUNBUFFERED=1 TER_RUNTIME_DIR=/data TER_THRESHOLD=126 TER_INTERVAL_SECONDS=15
# The image supplies verified browser binaries at /ms-playwright.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
CMD ["python", "monitor.py"]
