use std::io::{self, BufRead, IsTerminal, Write};
use std::process::ExitCode;
use std::sync::OnceLock;

use url_sanitize_core::{Catalog, SanitizeResult, Sanitizer, SanitizerOptions};

const EMBEDDED_CATALOG_JSON: &str = include_str!("../catalog/catalog.json");
const CRATE_VERSION: &str = env!("CARGO_PKG_VERSION");

static CATALOG: OnceLock<Catalog> = OnceLock::new();

fn catalog() -> &'static Catalog {
    CATALOG.get_or_init(|| {
        Catalog::from_json(EMBEDDED_CATALOG_JSON).expect("embedded catalog must parse")
    })
}

#[derive(PartialEq)]
enum Action {
    Run,
    Help,
    Version,
}

struct Args {
    action: Action,
    json: bool,
    explain: bool,
    options: SanitizerOptions,
    urls: Vec<String>,
    read_stdin: bool,
}

fn print_help(w: &mut dyn Write) {
    let _ = writeln!(
        w,
        "url-sanitize {} (catalog {} {})

Strip tracking parameters from URLs with the merged multi-source catalog.

USAGE:
    url-sanitize [OPTIONS] [URL]...
    url-sanitize [OPTIONS] -          read URLs from stdin (one per line)
    url-sanitize [OPTIONS] < file     same
    url-sanitize [OPTIONS] -- [URL]... treat every later argument as a URL

OPTIONS:
    --json                  Emit one JSON SanitizeResult per input line
    --explain               Default mode, plus a `# matched: ...` line on stderr
    --strip-referral        Strip affiliate / referral marketing params
    --keep-referral         Explicitly keep referral params (default)
    --unwrap-redirects      Unwrap redirector URLs (default)
    --no-unwrap-redirects   Leave redirector URLs untouched
    --block-domains         Emit `blocked` for domain-blocked URLs
    --version               Print version + catalog identity and generated date
    -h, --help              Show this help

EXIT CODES:
    0   all URLs processed; none blocked
    1   usage error
    2   at least one URL was blocked

Full spec: https://github.com/antonio-orionus/url-sanitize/blob/main/docs/spec.md",
        CRATE_VERSION,
        catalog().catalog_identity(),
        catalog().generated_at()
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
    let mut action = Action::Run;
    let mut end_of_options = false;

    for arg in raw {
        // After `--` every argument is a URL, so `url-sanitize -- "$untrusted"`
        // can't be turned into a flag.
        if end_of_options {
            urls.push(arg);
            continue;
        }
        match arg.as_str() {
            "--" => end_of_options = true,
            "-h" | "--help" => action = Action::Help,
            "--version" => {
                if action != Action::Help {
                    action = Action::Version;
                }
            }
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
        action,
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

/// Percent-encode control and bidi-override characters for text output: an
/// unparseable input is echoed as given, and `\x1b[...` or U+202E in it would
/// reach the terminal. Must match `printable()` in the TS CLI.
fn printable(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        let unprintable = matches!(ch, '\u{0}'..='\u{1f}' | '\u{7f}'..='\u{9f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}');
        if unprintable {
            let mut buf = [0u8; 4];
            for b in ch.encode_utf8(&mut buf).bytes() {
                out.push_str(&format!("%{:02X}", b));
            }
        } else {
            out.push(ch);
        }
    }
    out
}

/// Writes one result; returns whether it was blocked. A write error is
/// passed up so the run stops instead of reporting success.
fn emit(
    res: &SanitizeResult,
    json: bool,
    explain: bool,
    stdout: &mut dyn Write,
    stderr: &mut dyn Write,
) -> io::Result<bool> {
    if json {
        // serde_json::to_string is infallible on owned types here.
        let s = serde_json::to_string(res).expect("serialize SanitizeResult");
        writeln!(stdout, "{}", s)?;
        return Ok(matches!(res, SanitizeResult::Blocked { .. }));
    }
    match res {
        SanitizeResult::Unchanged { url } => {
            writeln!(stdout, "{}", printable(url))?;
            Ok(false)
        }
        SanitizeResult::Cleaned {
            url,
            original,
            matched_rules,
            ..
        } => {
            writeln!(stdout, "{}", printable(url))?;
            if explain {
                let providers: Vec<_> = matched_rules.iter().map(|m| m.provider.as_str()).collect();
                writeln!(
                    stderr,
                    "# cleaned: {} -> {} [{}]",
                    printable(original),
                    printable(url),
                    printable(&providers.join(","))
                )?;
            }
            Ok(false)
        }
        SanitizeResult::Redirected { url, original, via } => {
            writeln!(stdout, "{}", printable(url))?;
            if explain {
                writeln!(
                    stderr,
                    "# redirected: {} -> {} [{}]",
                    printable(original),
                    printable(url),
                    printable(&via.provider)
                )?;
            }
            Ok(false)
        }
        SanitizeResult::Blocked { original, via } => {
            writeln!(
                stderr,
                "blocked: {} (via {})",
                printable(original),
                printable(&via.provider)
            )?;
            Ok(true)
        }
    }
}

/// A reader that closes early (`| head -1`) ends the run quietly with the
/// exit code so far; any other write error exits 1.
fn write_failed(err: &io::Error, any_blocked: bool) -> ExitCode {
    if err.kind() == io::ErrorKind::BrokenPipe {
        return if any_blocked {
            ExitCode::from(2)
        } else {
            ExitCode::SUCCESS
        };
    }
    eprintln!("error: writing output: {}", err);
    ExitCode::from(1)
}

fn run() -> ExitCode {
    let raw: Vec<String> = std::env::args().skip(1).collect();

    let args = match parse_args(raw) {
        Ok(a) => a,
        Err(msg) => {
            eprintln!("error: {}", msg);
            eprintln!("run `url-sanitize --help` for usage");
            return ExitCode::from(1);
        }
    };

    if args.action == Action::Help {
        print_help(&mut io::stdout().lock());
        return ExitCode::SUCCESS;
    }
    if args.action == Action::Version {
        println!(
            "url-sanitize {} (catalog {} {})",
            CRATE_VERSION,
            catalog().catalog_identity(),
            catalog().generated_at()
        );
        return ExitCode::SUCCESS;
    }

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
        match emit(
            &res,
            args.json,
            args.explain,
            &mut stdout_lock,
            &mut stderr_lock,
        ) {
            Ok(blocked) => any_blocked |= blocked,
            Err(err) => return write_failed(&err, any_blocked),
        }
    }

    if use_stdin {
        let stdin = io::stdin();
        let mut reader = stdin.lock();
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => break,
                Ok(_) => {}
                Err(err) => {
                    eprintln!("error: reading stdin: {}", err);
                    return ExitCode::from(1);
                }
            }
            // Invalid UTF-8 becomes U+FFFD, as in the TS CLI, instead of
            // silently ending the batch.
            let line = String::from_utf8_lossy(&buf);
            let trimmed = line.trim_end_matches(['\r', '\n']);
            if trimmed.is_empty() {
                continue;
            }
            let res = sanitizer.sanitize(trimmed);
            match emit(
                &res,
                args.json,
                args.explain,
                &mut stdout_lock,
                &mut stderr_lock,
            ) {
                Ok(blocked) => any_blocked |= blocked,
                Err(err) => return write_failed(&err, any_blocked),
            }
        }
    }

    if let Err(err) = stdout_lock.flush() {
        return write_failed(&err, any_blocked);
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
