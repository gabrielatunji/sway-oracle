# AI Sports Oracle

Sports-focused AI-assisted oracle prototype for resolving objective prediction market questions about professional sports outcomes. The service aggregates scores from multiple sports data APIs, synthesizes evidence with GPT-4o-mini, and stores resolutions for auditability.

## Features

- TypeScript + Express.js API exposing a `/resolve` endpoint
- GPT-4o-mini powered reasoning with source-aware prompting
- Pluggable sports data fetchers (TheSportsDB, API-Sports, The Odds API)
- PostgreSQL logging for resolutions and raw evidence payloads
- Swagger UI docs served at `/docs` backed by `swagger.json`
- Dockerfile for containerized builds and deployments
- Basic retry + circuit breaker protection around upstream API calls

## Getting Started

### Prerequisites

- Node.js v18+
- npm v9+
- PostgreSQL 13+

### Installation

```powershell
cd sway-oracle
npm install
```

### Environment Variables

Copy the template and populate values for your environment and API keys:

```powershell
Copy-Item .env.example .env
```

| Key | Description |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API key enabled for GPT-4o-mini |
| `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` `PGDATABASE` | PostgreSQL connection info |
| `THESPORTSDB_API_KEY` | Optional key for TheSportsDB (free tier) |
| `API_SPORTS_KEY` | API-Sports key (basketball/football) |
| `THE_ODDS_API_KEY` | Optional odds/scores provider |
| `PORT` | Express server port (default `3000`) |

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS resolutions (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    resolution TEXT NOT NULL,
    confidence NUMERIC(4, 2) NOT NULL,
    reasoning TEXT NOT NULL,
    sources TEXT[] NOT NULL,
    evidence JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Apply via `psql` or your favorite migration tool before running the service.

### Development

```powershell
npm run dev
```

The API serves Swagger UI at `http://localhost:3000/docs` and health info at `http://localhost:3000/health`.

### Build

```powershell
npm run build
```

### Production Start

```powershell
npm start
```

### Docker

```powershell
# build image
docker build -t ai-sports-oracle .

# run container (requires reachable PostgreSQL instance)
docker run --rm -p 3000:3000 --env-file .env ai-sports-oracle
```

## Testing the Resolver

Use a simple `curl` or REST client call:

```powershell
curl -X POST http://localhost:3000/resolve -H "Content-Type: application/json" -d '{"query":"Did the Lakers win on Nov 5, 2025?"}'
```

## Project Structure

```
ai-sports-oracle/
├── Dockerfile
├── README.md
├── package.json
├── swagger.json
├── tsconfig.json
├── .env.example
└── src
    ├── db.ts
    ├── index.ts
    ├── resolver.ts
    ├── routes.ts
    └── utils.ts
```

## Next Steps

- Expand sport inference and team-name normalization
- Add job queue for batch settlements
- Integrate on-chain bridge for publishing resulting resolutions
- Implement automated tests and monitoring hooks
# sway-oracle
