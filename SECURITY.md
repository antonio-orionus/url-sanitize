# Security Policy

## Supported Versions

Security fixes are released for the latest published minor line. Before 1.0,
that means the latest `0.x` release only. After 1.0.0, supported versions are:

| Version | Supported |
| --- | --- |
| `1.x` | Yes |
| `< 1.0` | No |

## Reporting A Vulnerability

Please report security issues using a private GitHub security advisory:

https://github.com/antonio-orionus/url-sanitize/security/advisories/new

Include:

- the affected package, CLI, or release asset
- a minimal URL or catalog fixture that reproduces the issue
- whether the issue affects confidentiality, integrity, availability, or supply chain provenance

Do not open a public issue for exploitable ReDoS, malicious-rule, package
integrity, or release pipeline vulnerabilities.

## Scope

In scope:

- sanitizer behavior that can corrupt or mis-route URLs
- ReDoS or denial-of-service from catalog regex handling
- release asset, installer, package, or provenance verification issues
- vulnerabilities in bundled ClearURLs-derived catalog handling

Out of scope:

- tracking parameters not yet covered by upstream rules
- browser-extension behavior from the ClearURLs Addon
- HTTP interception, proxying, or DNS blocking features this project does not implement

## Response

I aim to acknowledge reports within 7 days. Valid critical issues receive a
coordinated fix and release before public disclosure when practical.
