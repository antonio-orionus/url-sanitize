from __future__ import annotations

import subprocess
import sys

from . import url_sanitize_bin


def main() -> int:
    completed = subprocess.run([str(url_sanitize_bin()), *sys.argv[1:]], check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
