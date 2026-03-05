# AGENTS.md

Instructions for AI coding agents working on this project.

## Project overview

`@cahva/router-cache` is a framework-agnostic, store-agnostic HTTP response
cache library. It is written in TypeScript, runs on Deno, and is published to
[JSR](https://jsr.io/@cahva/router-cache).

- **Runtime:** Deno (primary), Node.js (via JSR npm compatibility)
- **Version source of truth:** `deno.json` (`version` field)
- **Publishing:** JSR via `npx jsr publish` (GitHub Actions on push to main)
- **Tests:** `deno test --allow-net --allow-read`
- **Type checking:** `deno check mod.ts src/stores/redis.ts src/stores/memory.ts`

## Release process

When asked to prepare a release, follow these steps:

### 1. Determine the version bump

- **patch** (0.0.x): bug fixes, documentation changes, new examples
- **minor** (0.x.0): new features, non-breaking additions
- **major** (x.0.0): breaking changes to the public API

### 2. Update CHANGELOG.md

Add a new section at the top (below the header), following the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Removed
- Removed features
```

Populate entries based on commits since the last release. Use `git log` to
review changes. Write entries from the user's perspective, not implementation
details.

### 3. Bump the version in deno.json

Update the `version` field in `deno.json`. This is the **only** place the
version lives.

### 4. Commit and tag

```bash
git add CHANGELOG.md deno.json
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
```

### 5. Push

```bash
git push && git push --tags
```

The GitHub Actions workflow will automatically publish to JSR on push to main.

## Code conventions

- ESM only, TypeScript strict mode
- Tests use `@std/testing/bdd` (describe/it) and `@std/expect`
- Conventional commit messages: `feat:`, `fix:`, `docs:`, `chore:`, `build:`,
  `test:`, `refactor:`
- Examples are standalone projects in `examples/` with their own dependencies.
  They are **not** published to JSR (excluded from `publish.include`).
- The `examples/` directory has its own `README.md` with a table of all examples

## File structure

```
deno.json              # Package config, version, exports, tasks
mod.ts                 # Public API entry point
src/
  core/
    cache.ts           # RouterCache class
    expire.ts          # TTL normalization
    sizeof.ts          # Object size estimation
    types.ts           # CacheStore interface, CacheEntry, etc.
  stores/
    redis.ts           # RedisStore (SCAN-based wildcard keys)
    memory.ts          # MemoryStore (dev/testing)
tests/                 # Mirrors src/ structure
examples/
  deno-hono-redis/     # Deno + Hono + Redis
  nodejs-express-memory/  # Node.js + Express 5 + MemoryStore
  nodejs-fastify-memory/  # Node.js + Fastify 5 + MemoryStore
```
