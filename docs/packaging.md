# Packaging

This repository contains package-manager metadata for v0.2:

- [`Formula/url-sanitize.rb`](../Formula/url-sanitize.rb) for Homebrew formula validation
- [`bucket/url-sanitize.json`](../bucket/url-sanitize.json) for Scoop manifest validation
- [`scripts/render-package-manager-files.mjs`](../scripts/render-package-manager-files.mjs)
  for release-time generation from `SHA256SUMS`

The checked-in formula and manifest are validation fixtures and starting points.
The release workflow renders fresh copies from the actual GitHub Release
`SHA256SUMS` file and can push them to dedicated package-manager repositories.

## Current Stance

- Homebrew: publish through a dedicated tap repo.
- Scoop: publish through a dedicated bucket repo.
- Winget, AUR, distro packages: wait for demand or cheap automation.

## One-Time Setup

Create the package repositories:

- `antonio-orionus/homebrew-url-sanitize`
- `antonio-orionus/scoop-url-sanitize`

Configure the main `url-sanitize` repository:

- Secret `PACKAGING_REPO_TOKEN`: a fine-grained token or GitHub App token that
  can write contents to both package repositories.
- Variable `HOMEBREW_TAP_REPO`: defaults to
  `antonio-orionus/homebrew-url-sanitize`.
- Variable `SCOOP_BUCKET_REPO`: defaults to
  `antonio-orionus/scoop-url-sanitize`.

After `github-release` and installer smoke tests pass, `release.yml` renders the
formula and manifest from the published `SHA256SUMS`, commits changed files to
those repos, and pushes them. If `PACKAGING_REPO_TOKEN` is absent, the release
continues and package-manager publishing is skipped.

## User Commands

Once the package repos exist and the first automated publish has run:

```sh
brew install antonio-orionus/url-sanitize/url-sanitize
```

```powershell
scoop bucket add url-sanitize https://github.com/antonio-orionus/scoop-url-sanitize
scoop install url-sanitize
```

## Scaling To More Package Repositories

The current release job is intentionally explicit because there are only two
package-manager repos. If more public repos are added, keep the same renderer
model but avoid duplicating checkout/copy/commit blocks in YAML. Move package
publishing into a small script that accepts a generated file, target repository,
target path, and commit message, then call it for each package repo from a
matrix.

Use a GitHub App token instead of a fine-grained PAT once there are several
external repos. It is easier to rotate, can be installed on selected repos, and
does not depend on a personal account token.
