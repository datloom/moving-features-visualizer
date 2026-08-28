# Workshop Docker setup

Place this directory at `moving-features-visualizer/docker/`.
The Vite/React project stays in the repository root.

Expected repository layout:

```text
moving-features-visualizer/
├── src/
├── public/
├── package.json
├── package-lock.json
├── vite.config.ts
└── docker/
    ├── Dockerfile
    ├── Dockerfile.dockerignore
    ├── docker-compose.yml
    ├── nginx.conf
    └── README.md
```

## Prerequisite images

The workshop assumes these images have already been pulled:

```bash
docker pull ghcr.io/taehoonk/pygeoapi-mf-api:latest
docker pull ghcr.io/taehoonk/pygeoapi-mf-api-mobilitydb:latest
```

The Compose setup uses the `mf-api.config.yml` already included inside the
MF-API image, copying it to `/pygeoapi/local.config.yml` before startup.

## Start from the repository root

```bash
docker compose -f docker/docker-compose.yml up --build -d
```

Or from inside the `docker` directory:

```bash
cd docker
docker compose up --build -d
```

Open:

- Visualizer: http://localhost:9000
- MF API: http://localhost:5050
- MF API collections: http://localhost:5050/collections
- MobilityDB host port: 25432

## Check status

From the repository root:

```bash
docker compose -f docker/docker-compose.yml ps
```

## Logs

```bash
docker compose -f docker/docker-compose.yml logs -f
```

For only the API:

```bash
docker compose -f docker/docker-compose.yml logs -f mf-api
```

## Stop

```bash
docker compose -f docker/docker-compose.yml down
```

## Full database reset

This removes the workshop MobilityDB volume. The database initialization bundled
with the MobilityDB image runs again on the next start.

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up --build -d
```

## Port overrides

Defaults are Visualizer `9000`, MF API `5050`, and MobilityDB `25432`.
They can be overridden without editing the YAML:

```bash
VISUALIZER_PORT=9100 MF_API_PORT=5150 docker compose -f docker/docker-compose.yml up --build -d
```

For the workshop, keep the defaults unless a participant already uses one of
these ports.
