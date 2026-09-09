# Security policy

## Supported versions

Cutroom is pre-1.0 software. Security fixes target the current `main` branch; there is no maintained older release line yet.

## Report privately

Use [GitHub's private vulnerability reporting form](https://github.com/Batuktech/Cutroom/security/advisories/new). Include the affected commit, reproduction steps, expected impact, and a minimal synthetic example. Do not upload actual user videos, transcripts, credentials, or a copy of `.cutroom/`.

There is no guaranteed response time or paid bug bounty. Avoid publishing exploit details before maintainers have had an opportunity to assess the report and arrange disclosure.

## Security boundary

This is a single-user application bound to `127.0.0.1`. It has no login system and is not designed for public hosting, a shared server, or untrusted tenants. Do not expose its port through a public reverse proxy or tunnel.

Host/Origin checks, registered media IDs, subprocess argument arrays, and file-protocol restrictions help constrain requests. They do not sandbox FFmpeg or Python from the operating-system account running Cutroom. Keep those tools updated and treat untrusted media as untrusted input. Local project files and transcripts are not encrypted by Cutroom.

Model installation and YouTube import deliberately access the network. Transcription and clip analysis use installed local models. See [privacy and storage](docs/privacy.md) and [architecture](docs/architecture.md) for details.
