# Project: website_hardening
# Scope: global

## Architecture
- Backend: PHP with SQLite database.
- Frontend: HTML/CSS/JavaScript.
- Server configuration: `.htaccess` for access control.
- Deployment: `deploy.js` using Node.js for FTP upload.
- Version control: Git with multiple remotes (`origin/main`, `production/master`, `production/gh-pages`).

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | Security Audit | Read files, analyze, and write `site_audit/security_report.md` | None | DONE | 6663966b-42d5-449e-9600-f143d80b1c32, 66887193-56cd-4dfc-a133-16a3320c2d1e, 251ecc5d-8dfc-4782-b2a4-f00867abebc2 |
| 2 | Backend Hardening | Secure credentials, DB direct download protection, prepared statements, HTTP security headers | M1 | DONE | 172cac97-dbde-4327-8506-3a91ab42d40d |
| 3 | Frontend Hardening | Force HTTPS, clean console logs/comments/sensitive data in main.js/index.html | M1 | DONE | 172cac97-dbde-4327-8506-3a91ab42d40d |
| 4 | Deployment & Version Control | Run deploy.js, commit, push to origin/main, production/master, production/gh-pages | M2, M3 | IN_PROGRESS | b931ebcd-fb92-44a9-bf91-f7787037fbc0 |

## Interface Contracts
### admin.php & api/admin_citas.php ↔ Authentication
- Admin credentials verified using password hashing (bcrypt).
- Session creation and API validation remain compatible with the rest of the application.
