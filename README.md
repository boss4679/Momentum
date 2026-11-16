# Momentum

A full-stack productivity app: workout tracking, a scheduling calendar and calorie logging
in one dashboard. Express + PostgreSQL (raw SQL) + React.

> Work in progress: being rebuilt milestone by milestone. See [LEARNING_NOTES.md](LEARNING_NOTES.md)
> for progress and [docs/schema.md](docs/schema.md) for the database design. The full README
> (architecture, endpoint table, how to run the tests) arrives in the final milestone.

## Quick start (Docker)

```bash
docker compose up --build                 # db + api + client
docker compose exec api npm run seed      # demo data: demo@momentum.dev / password123
curl http://localhost:4000/api/health
```
