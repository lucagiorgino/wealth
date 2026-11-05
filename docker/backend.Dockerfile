FROM python:3.13-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

FROM base AS test
RUN pip install --no-cache-dir ".[dev]"
COPY tests ./tests
CMD ["python", "-m", "pytest", "-q"]

FROM base AS runtime
RUN useradd --create-home --uid 10001 wealth
USER wealth
EXPOSE 8000
CMD ["python", "-m", "app"]
