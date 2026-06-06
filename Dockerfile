FROM python:3.11-slim

WORKDIR /app

# System deps for WeasyPrint + Kaleido
RUN apt-get update && apt-get install -y \
    build-essential \
    libpango1.0-dev \
    libcairo2-dev \
    libgdk-pixbuf-xlib-2.0-dev \
    libffi-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[all]"

COPY backend/ backend/
COPY telegram_bot/ telegram_bot/
COPY report_templates/ report_templates/

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
