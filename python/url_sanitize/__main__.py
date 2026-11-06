from __future__ import annotations

import os
import subprocess
import sys

from . import _WRAPPED_ENV, url_sanitize_bin


def main() -> int:
    if os.environ.get(_WRAPPED_ENV):
        # The binary we ran was this wrapper again; running on would spawn
        # processes without end.
        print(
            "error: url-sanitize resolved to the Python wrapper itself; "
            "install the native CLI or set URL_SANITIZE_BIN",
            file=sys.stderr,
        )
        return 1
    completed = subprocess.run(
        [str(url_sanitize_bin()), *sys.argv[1:]],
        check=False,
        env={**os.environ, _WRAPPED_ENV: "1"},
    )
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
