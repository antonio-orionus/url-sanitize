# @url-sanitize/cli

Command-line URL sanitizer.

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
```

## License

MIT.
