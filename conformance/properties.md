# Conformance Properties

These properties MUST hold for every implementation of the url-sanitize spec.
They are enforced by property tests in CI (in addition to the example-based
vector corpus).

## P1 — Idempotence

For all inputs `s` and all option sets `o`:

```
sanitize(sanitize(s, o).url, o).url === sanitize(s, o).url
```

(taking `url` of the result, falling back to the input for `blocked`).

Rationale: agents and pipelines often re-sanitize. A second pass must be a
no-op. Violations indicate a rule oscillates or that re-parsing produces a
form that re-matches a rule.

## P2 — Host integrity

If `sanitize(s, o)` returns `cleaned`, then for the parsed forms of `s` and
`result.url`:

- `host` is byte-for-byte identical
- `scheme` is byte-for-byte identical
- `port` is byte-for-byte identical

`cleaned` may only modify query, fragment, and (via `raw-replace`) path. It
MUST NOT cross-origin redirect. Cross-origin transitions are only legal under
`kind: "redirected"` (where the user opted in via `unwrapRedirects: true`).

## P3 — Path integrity (default)

If `sanitize(s, o)` returns `cleaned` and no `raw-replace` rule fired
(`matchedRules` contains only `strip-param`), then `result.url`'s path is
byte-for-byte identical to the parsed path of `s`.

Strip-param rules MUST NOT alter the path. Only `raw-replace` may.

## P4 — Malformed input is unchanged

If the WHATWG URL parser cannot parse `s`, then:

```
sanitize(s, o) === { kind: "unchanged", url: s }
```

No regex is run against unparseable input. The input string is returned
verbatim (not normalized, not trimmed).

## P5 — Option monotonicity

Enabling an opt-in option can only **add** sanitization, never remove it. For
the default option set `O₀` and any superset `O₁ ⊇ O₀` (where superset means
every opt-in flag in `O₀` is also true in `O₁`):

- If `sanitize(s, O₀).kind === "cleaned"`, then `sanitize(s, O₁).kind ∈ {"cleaned", "redirected", "blocked"}`.
- `sanitize(s, O₁).strippedParams ⊇ sanitize(s, O₀).strippedParams` (when both are cleaned).

Rationale: turning a flag on never weakens the result.

## P6 — Determinism

For all `s`, `o`, and a fixed catalog: `sanitize(s, o)` is a pure function.
Two calls in the same process, in different processes, on different platforms,
and from different language bindings produce equal results.

## P7 — Empty / trivial inputs

- `sanitize("")` → `{ kind: "unchanged", url: "" }`
- `sanitize("not a url")` → `{ kind: "unchanged", url: "not a url" }`
- `sanitize("https://example.com/")` (no tracking params) → `{ kind: "unchanged", url: "https://example.com/" }`

## P8 — Fragment params

Strip-param rules apply to both the query string (`?a=b&c=d`) and the
fragment when the fragment is itself a query (`#a=b&c=d`). The fragment is
NOT decoded as a URL — it is split on `&` and treated like a query body.

## P9 — Percent-encoding preservation

Strip-param rules MUST NOT re-encode or decode kept parameter values. The
substring of `result.url` corresponding to a kept `name=value` pair is
byte-for-byte equal to the same substring of the post-parse normalized form
of `s`.

(Note: WHATWG URL normalization itself may percent-encode parts of the input —
this is allowed and is observed in the `unchanged` case as well.)

## P10 — Failed redirect unwrap continues

If an `unwrap-redirect` rule matches but the captured target is empty or fails
URL parsing, the rule is skipped and iteration continues — it does NOT
terminate with `redirected`, and it does NOT corrupt `current`.
