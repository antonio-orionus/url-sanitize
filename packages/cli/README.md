# @url-sanitize/cli

Command-line tool for removing tracking parameters and unwrapping tracking redirects from URLs.

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
Release installer from the root README.

## License

MIT.
