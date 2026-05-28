# url-sanitize

Python wrapper for the native `url-sanitize` CLI.

```sh
pip install url-sanitize
cargo install url-sanitize
python -m url_sanitize "https://example.com/?utm_source=x"
```

```py
from url_sanitize import sanitize

result = sanitize("https://example.com/?utm_source=x")
print(result["url"])
```

The package shells out to the same Rust binary used by crates.io,
Homebrew/Scoop, and GitHub Release downloads. Set
`URL_SANITIZE_BIN=/path/to/url-sanitize` or put `url-sanitize` on `PATH`.
