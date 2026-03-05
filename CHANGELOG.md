# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2] - 2025-03-05

### Added

- Fastify 5 + MemoryStore example (`examples/nodejs-fastify-memory/`)

### Fixed

- Express example dependency pointed to `^0.2.0` instead of `^0.3.0`

### Changed

- Acknowledgements section: correctly note that the original `express-redis-cache`
  used the blocking `KEYS` command; this library improves on it with `SCAN`
- Mention that the project was started because the original library no longer
  works in Node.js v24

## [0.3.1] - 2025-02-28

### Added

- CI workflow for publishing to JSR on push to main

## [0.3.0] - 2025-02-27

### Changed

- **BREAKING:** Removed built-in Hono adapter. The library is now fully
  framework-agnostic — bring your own thin middleware adapter.
- Updated Deno + Hono example to use an external adapter

### Fixed

- Deno Hono Redis example: add required `--allow-net` permissions

## [0.2.2] - 2025-02-26

### Added

- Express 5 + in-memory store example (`examples/nodejs-express-memory/`)
- Examples section in README

## [0.2.1] - 2025-02-25

### Fixed

- Hono adapter: use full path + search query for the cache key instead of
  path alone

## [0.2.0] - 2025-02-24

### Added

- `MemoryStore` — in-memory cache store for development and testing with
  lazy TTL eviction
- Deno + Hono + Redis example

## [0.1.0] - 2025-02-23

### Added

- Initial release
- `RouterCache` core with `get`, `add`, `del` operations
- `RedisStore` with `SCAN`-based wildcard key matching
- Wildcard get/delete support via glob patterns
- Binary mode for caching binary responses via base64 encoding
- Flexible TTL: static numbers, objects, or request-aware functions
- Fail-open error handling
- ESM + TypeScript, published on JSR
