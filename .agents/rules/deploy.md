# Deployment & Public Safety Rules

- **Anonymous Visitor Safety:** Public unauthenticated visitors default to `OFFLINE_FIXTURE` and `local_demo`. Live Nebius Token Factory calls and cloud serverless jobs require configured demo authorization.
- **CSP & Permissions-Policy:** Strict Content Security Policy permits only self-hosted scripts, workers, WASM, and model binaries. `Permissions-Policy` restricts camera access strictly to the application origin.
- **Diagnostics Export:** `/status` provides a one-click diagnostics export JSON bundle containing `BuildStamp`, feature flags, performance stats, and sanitized recent error logs. No secrets or camera frames are ever included.
