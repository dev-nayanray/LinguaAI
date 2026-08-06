# Local-dev Postgres image: pgvector's own image plus pg_partman (ADR-028),
# baked into the image itself rather than apt-get'd ad hoc into a running
# container. E4 T1 found and flagged this exact gap (pg_partman installed
# by hand into a live container, "not yet added to any committed
# Dockerfile/image — a real follow-up needed before T5/T10 can rely on it
# in CI or a fresh clone") — this file closes it. CI provisioning a real
# Postgres service is separate, still-open E4 T11 scope.
FROM pgvector/pgvector:pg16

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-partman \
    && rm -rf /var/lib/apt/lists/*
