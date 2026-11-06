from __future__ import annotations

import json
import os
import subprocess
import sys
from importlib import resources
from pathlib import Path
from typing import Any

__all__ = ["sanitize", "url_sanitize_bin"]

# Set in the native CLI's environment. If the wrapper sees it, it found and
# ran itself instead of the native binary.
_WRAPPED_ENV = "URL_SANITIZE_WRAPPED"


def sanitize(url: str, *, timeout: float | None = 30.0, **opts: bool) -> dict[str, Any]:
    args = ["--json"]
    if opts.get("strip_referral"):
        args.append("--strip-referral")
    if opts.get("keep_referral"):
        args.append("--keep-referral")
    if opts.get("no_unwrap_redirects"):
        args.append("--no-unwrap-redirects")
    if opts.get("block_domains"):
        args.append("--block-domains")
    if url.startswith("-"):
        # `-` would read stdin and `--help` would print help. `--` needs a
        # native CLI new enough to know it, so only flag-like URLs send it.
        args.append("--")
    args.append(url)

    completed = subprocess.run(
        [str(url_sanitize_bin()), *args],
        check=False,
        capture_output=True,
        stdin=subprocess.DEVNULL,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        env={**os.environ, _WRAPPED_ENV: "1"},
    )
    if completed.returncode not in (0, 2):
        raise RuntimeError(completed.stderr.strip() or "url-sanitize failed")
    # Split on "\n" only: str.splitlines() also splits on U+2028, which the
    # JSON output may contain unescaped.
    return json.loads(completed.stdout.split("\n", 1)[0])


def _is_python_shim(path: Path) -> bool:
    """True for pip's `url-sanitize` console script, which is this wrapper.

    On POSIX it is a `#!` script; on Windows a launcher .exe with a zip
    archive appended. The native CLI is neither.
    """
    try:
        with path.open("rb") as f:
            if f.read(2) == b"#!":
                return True
            f.seek(0, os.SEEK_END)
            if f.tell() < 22:
                return False
            f.seek(-22, os.SEEK_END)
            return f.read(4) == b"PK\x05\x06"
    except OSError:
        return True


def _find_on_path(binary: str) -> Path | None:
    """Search PATH for the native CLI by its exact name.

    Unlike shutil.which, this never searches the current folder (Windows does
    by default) and never tries PATHEXT, where a `.cmd` shim would run the URL
    through cmd.exe. It skips pip's console script, which is this wrapper.
    """
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        if not entry or not os.path.isabs(entry):
            continue
        candidate = Path(entry) / binary
        if candidate.is_file() and os.access(candidate, os.X_OK) and not _is_python_shim(candidate):
            return candidate
    return None


def url_sanitize_bin() -> Path:
    env = os.environ.get("URL_SANITIZE_BIN")
    if env:
        return Path(env)

    binary = "url-sanitize.exe" if sys.platform == "win32" else "url-sanitize"
    packaged = resources.files(__package__).joinpath("bin", binary)
    if packaged.is_file():
        return Path(str(packaged))

    found = _find_on_path(binary)
    if found:
        return found

    raise RuntimeError(
        "url-sanitize binary not found. Install the Rust CLI with "
        "`cargo install url-sanitize` or set URL_SANITIZE_BIN."
    )
