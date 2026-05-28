use std::io::{self, BufRead, IsTerminal, Write};
use std::process::ExitCode;
use std::sync::OnceLock;

use url_sanitize_core::{Catalog, SanitizeResult, Sanitizer, SanitizerOptions};

const EMBEDDED_CATALOG_JSON: &str = include_str!("../../../catalog/clearurls.json");
const CRATE_VERSION: &str = env!("CARGO_PKG_VERSION");

static CATALOG: OnceLock<Catalog> = OnceLock::new();

fn catalog() -> &'static Catalog {
    CATALOG.get_or_init(|| {
        Catalog::from_json(EMBEDDED_CATALOG_JSON).expect("embedded catalog must parse")
    })
}

struct Args {
    json: bool,
    explain: bool,
    options: SanitizerOptions,
    urls: Vec<String>,
    read_stdin: bool,
}

fn print_help(w: &mut dyn Write) {
    let _ = writeln!(
        w,
        "url-sanitize {} (catalog {})

Strip tracking parameters from URLs.

USAGE:
    url-sanitize [OPTIONS] [URL]...
    url-sanitize [OPTIONS] -          read URLs from stdin (one per line)
    url-sanitize [OPTIONS] < file     same

OPTIONS:
    --json                  Emit one JSON SanitizeResult per input line
    --explain               Default mode, plus a `# matched: ...` line on stderr
    --strip-referral        Strip affiliate / referral marketing params
    --keep-referral         Explicitly keep referral params (default)
    --unwrap-redirects      Unwrap redirector URLs (default)
    --no-unwrap-redirects   Leave redirector URLs untouched
    --block-domains         Emit `blocked` for domain-blocked URLs
    --version               Print version + catalog hash
    -h, --help              Show this help

EXIT CODES:
    0   all URLs processed; none blocked
    1   usage error
    2   at least one URL was blocked

Full spec: https://github.com/antonio-orionus/url-sanitize/blob/main/docs/spec.md",
        CRATE_VERSION,
        catalog().catalog_hash().unwrap_or("unknown")
    );
}

fn parse_args(raw: Vec<String>) -> Result<Args, String> {
    let mut json = false;
    let mut explain = false;
    let mut strip_referral = false;
    let mut keep_referral_explicit = false;
    let mut unwrap_redirects: Option<bool> = None;
    let mut domain_blocking = false;
    let mut urls = Vec::new();
    let mut read_stdin = false;

    for arg in raw {
        match arg.as_str() {
            "--json" => json = true,
            "--explain" => explain = true,
            "--strip-referral" => strip_referral = true,
            "--keep-referral" => keep_referral_explicit = true,
            "--unwrap-redirects" => unwrap_redirects = Some(true),
            "--no-unwrap-redirects" => unwrap_redirects = Some(false),
            "--block-domains" => domain_blocking = true,
            "-" => read_stdin = true,
            s if s.starts_with("--") || (s.starts_with('-') && s.len() > 1) => {
                return Err(format!("unknown flag: {}", s));
            }
            _ => urls.push(arg),
        }
    }

    if keep_referral_explicit {
        strip_referral = false;
    }

    Ok(Args {
        json,
        explain,
        options: SanitizerOptions {
            strip_referral_marketing: strip_referral,
            unwrap_redirects,
            domain_blocking,
        },
        urls,
        read_stdin,
    })
}

fn emit(
    res: &SanitizeResult,
    json: bool,
    explain: bool,
    stdout: &mut dyn Write,
    stderr: &mut dyn Write,
) -> bool {
    if json {
        // serde_json::to_string is infallible on owned types here.
        let s = serde_json::to_string(res).expect("serialize SanitizeResult");
        let _ = writeln!(stdout, "{}", s);
        return matches!(res, SanitizeResult::Blocked { .. });
    }
    match res {
        SanitizeResult::Unchanged { url } => {
            let _ = writeln!(stdout, "{}", url);
            false
        }
        SanitizeResult::Cleaned {
            url,
            original,
            matched_rules,
            ..
        } => {
            let _ = writeln!(stdout, "{}", url);
            if explain {
                let providers: Vec<_> = matched_rules.iter().map(|m| m.provider.as_str()).collect();
                let _ = writeln!(
                    stderr,
                    "# cleaned: {} -> {} [{}]",
                    original,
                    url,
                    providers.join(",")
                );
            }
            false
        }
        SanitizeResult::Redirected { url, original, via } => {
            let _ = writeln!(stdout, "{}", url);
            if explain {
                let _ = writeln!(
                    stderr,
                    "# redirected: {} -> {} [{}]",
                    original, url, via.provider
                );
            }
            false
        }
        SanitizeResult::Blocked { original, via } => {
            let _ = writeln!(stderr, "blocked: {} (via {})", original, via.provider);
            true
        }
    }
}

fn run() -> ExitCode {
    let raw: Vec<String> = std::env::args().skip(1).collect();

    if raw.iter().any(|a| a == "-h" || a == "--help") {
        print_help(&mut io::stdout().lock());
        return ExitCode::SUCCESS;
    }
    if raw.iter().any(|a| a == "--version") {
        println!(
            "url-sanitize {} (catalog {})",
            CRATE_VERSION,
            catalog().catalog_hash().unwrap_or("unknown")
        );
        return ExitCode::SUCCESS;
    }

    let args = match parse_args(raw) {
        Ok(a) => a,
        Err(msg) => {
            eprintln!("error: {}", msg);
            eprintln!("run `url-sanitize --help` for usage");
            return ExitCode::from(1);
        }
    };

    let sanitizer: Sanitizer = catalog().compile(args.options);

    let mut stdout_lock = io::stdout().lock();
    let mut stderr_lock = io::stderr().lock();
    let mut any_blocked = false;

    let use_stdin = args.read_stdin || (args.urls.is_empty() && !io::stdin().is_terminal());

    if args.urls.is_empty() && !use_stdin {
        print_help(&mut stderr_lock);
        return ExitCode::from(1);
    }

    for url in &args.urls {
        let res = sanitizer.sanitize(url);
        if emit(
            &res,
            args.json,
            args.explain,
            &mut stdout_lock,
            &mut stderr_lock,
        ) {
            any_blocked = true;
        }
    }

    if use_stdin {
        let stdin = io::stdin();
        let reader = stdin.lock();
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let trimmed = line.trim_end_matches(['\r', '\n']);
            if trimmed.is_empty() {
                continue;
            }
            let res = sanitizer.sanitize(trimmed);
            if emit(
                &res,
                args.json,
                args.explain,
                &mut stdout_lock,
                &mut stderr_lock,
            ) {
                any_blocked = true;
            }
        }
    }

    if any_blocked {
        ExitCode::from(2)
    } else {
        ExitCode::SUCCESS
    }
}

fn main() -> ExitCode {
    run()
}
