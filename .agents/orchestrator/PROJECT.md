# Project: Site Audit quiropodialc.com

## Architecture
- Target site: quiropodialc.com
- Files: index.html, style.css, main.js
- Deliverable: site_audit/informe_auditoria.md

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Security & Performance Audit | Analyze security risks (headers, HTTPS, tags) and performance characteristics (asset sizes, layout, scripts, load time estimation) | None | DONE |
| 2 | SEO Analysis | Analyze metadata, headers, semantic layout, image alt attributes, and indexability | None | DONE |
| 3 | Brainstorming & Improvement Recommendations | Formulate actionable suggestions for conversions, UI/UX, and marketing | M1, M2 | DONE |
| 4 | Final Report Generation | Compile all findings into site_audit/informe_auditoria.md and verify acceptance criteria | M3 | DONE |

## Interface Contracts
- All subtask findings are stored in the respective subagent folders.
- The final report must combine all findings into a structured document.

## Code Layout
- `.agents/orchestrator/` - Metadata, plans, and state files.
- `site_audit/informe_auditoria.md` - Target output audit file.
