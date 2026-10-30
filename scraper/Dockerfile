# Prospecting website reader (see README.md). Talks to the app only through Postgres.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY zx_scraper ./zx_scraper
COPY tests ./tests
COPY pytest.ini .

RUN useradd --create-home scraper
USER scraper

CMD ["python", "-m", "zx_scraper.worker"]
