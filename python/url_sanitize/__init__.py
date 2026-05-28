from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from importlib import resources
from pathlib import Path
from typing import Any

__all__ = ["sanitize", "url_sanitize_bin"]


def sanitize(url: str, **opts: bool) -> dict[str, Any]:
    args = ["--json"]
    if opts.get("strip_referral"):
        args.append("--strip-referral")
    if opts.get("keep_referral"):
        args.append("--keep-referral")
    if opts.get("no_unwrap_redirects"):
        args.append("--no-unwrap-redirects")
    if opts.get("block_domains"):
        args.append("--block-domains")
    args.append(url)

    completed = subprocess.run(
        [str(url_sanitize_bin()), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode not in (0, 2):
        raise RuntimeError(completed.stderr.strip() or "url-sanitize failed")
    return json.loads(completed.stdout.splitlines()[0])


def url_sanitize_bin() -> Path:
    env = os.environ.get("URL_SANITIZE_BIN")
    if env:
        return Path(env)

    binary = "url-sanitize.exe" if sys.platform == "win32" else "url-sanitize"
    packaged = resources.files(__package__).joinpath("bin", binary)
    if packaged.is_file():
        return Path(str(packaged))

    found = shutil.which("url-sanitize")
    if found and Path(found).resolve() != Path(sys.argv[0]).resolve():
        return Path(found)

    raise RuntimeError(
        "url-sanitize binary not found. Install the Rust CLI with "
        "`cargo install url-sanitize` or set URL_SANITIZE_BIN."
    )
