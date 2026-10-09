# Codex Cloud setup for mj-dual

Use this branch to prepare an isolated development environment for `duanap/mj-dual`.

- Migration branch: `codex/cloud-migration/2026-10-09`
- Source baseline: `99e23493b3f8ad3fad717a6b50d77b0b071807d3`
- Runtime: Node.js {"node": ">=20"}
- Setup status: repository and command inspection complete; cloud installation and runtime checks pending.

## Install dependencies

Run from the repository root:

```bash
npm ci
```

## Check the environment

Run the applicable checks and record their actual results:

```bash
npm run test
```

## Start development

Run in the development environment:

```bash
npm run server
```

Check the documented local health endpoint or page after startup.

## Configuration and work boundaries

- Read the existing `AGENTS.md` and README before changing behavior.
- Put credentials in cloud environment configuration; keep `.env`, private keys, production databases, uploads, and dependency directories out of commits.
- Use synthetic development data. Production deployment and production database operations require a separate request.
- Keep existing APIs, game rules, and authentication behavior.
- Use local checks. Do not add CI or paid GitHub features for this migration.
- Preserve focused branches; do not force-push or overwrite the default branch.

- This branch includes existing uncommitted work as a migration snapshot. Application tests for that work remain pending; review it before merging.

See the [official cloud environment guide](https://learn.chatgpt.com/docs/environments/cloud-environments) for environment publication and credentials.
