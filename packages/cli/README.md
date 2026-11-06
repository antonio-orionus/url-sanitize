# @url-sanitize/cli

Command-line tool for removing tracking parameters and unwrapping tracking redirects from URLs with the merged multi-source catalog.

The default catalog combines ClearURLs, Brave (Debouncer, query filter and
clean-URLs lists), and Firefox Query Stripping rules. The AdGuard URL Tracking source (GPL-3.0 data) is not included;
use `@url-sanitize/adguard` from code to add it.

## Install

```sh
npm install -g @url-sanitize/cli
# or
npx @url-sanitize/cli "https://example.com/?utm_source=x"
```

## Usage

```sh
url-sanitize "https://example.com/?utm_source=x"
# https://example.com/

url-sanitize --json "https://example.com/?utm_source=x"
# {"kind":"cleaned","original":"...","url":"...","strippedParams":["utm_source"],"matchedRules":[...]}

printf '%s\n' "https://example.com/?utm_source=x" | url-sanitize -
# https://example.com/
```

The npm CLI is pure TypeScript so it installs without native package setup. For
the smallest standalone binary, use `cargo install url-sanitize` or the GitHub
Release installer from the root README. For OS-specific native install commands,
see the [root README](https://github.com/antonio-orionus/url-sanitize#install).

## License

MIT. Rule data comes from dependencies that keep their own licenses:
ClearURLs data is LGPL-3.0-only, Brave and Firefox data are MPL-2.0.
