# CLAUDE.md — Continuum Capital Chicago OS

Repo under `/Users/gocrazyglobal/Projects/continuumcapitalchicago-os`.

---

## CRITICAL — Chain of command

**There is NO standalone Supabase.** Lovable-managed only.

Do **not** use the `supabase` CLI (403 = FALSE wall), supabase.com dashboard for migrations, or ask the user to paste SQL.

| Action | Where |
|--------|--------|
| Code | GitHub `main` |
| SQL / migrations | **Lovable SQL editor** |
| Frontend | Lovable **Publish** |
| Edge functions | Lovable **Edge Functions → redeploy** |
| Secrets | Lovable Cloud — never ask in chat |

**Publish ≠ edge redeploy.**

| | |
|--|--|
| Supabase (Lovable Cloud) | `mdmetmylcfkehugcpbjg` |
| Local | `/Users/gocrazyglobal/Projects/continuumcapitalchicago-os` |

Media/assets: `/Volumes/T7` only — never iCloud Drive paths.
