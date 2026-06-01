# Benchmarks

Current TypeScript sanitizer benchmark, generated with:

```sh
pnpm benchmark
```

Environment for the numbers below: local Linux workstation, Node.js via the
repo toolchain, ClearURLs catalog hash
`df97eb5c1aeeb9f96d0c28a6a60604f3cb2b1f9e7776eee228258e1b2bae1424`.

| Catalog rules | Iterations | Total ms | Ops/sec | p50 ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 819 | 50,000 | 5,587.588 | 8,948 | 0.120 | 0.187 | 1.970 |

These numbers are a release sanity check, not a cross-machine performance
contract. CI fuzz tests enforce the stronger 1.0 guardrail: no generated input
may take 50ms or more in a single sanitize call.
