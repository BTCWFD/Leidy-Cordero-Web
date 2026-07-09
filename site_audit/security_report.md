# Security Audit and Hardening Report

This report summarizes the security risks identified in the audit of **quiropodialc.com** and details the corresponding hardening measures implemented to mitigate them.

---

## 1. Summary of Identified Risks and Mitigation Status

### 1.1. SQL Injection (SQLi)
- **Risk Description**: Potential for database manipulation or sensitive data extraction if SQL queries are constructed by concatenating user inputs.
- **Mitigation Status**: **Mitigated**
- **Action Taken**: Verified that all SQLite database query structures in the PHP codebase (including `api/admin_citas.php`, `api/disponibilidad.php`, and `api/reservas.php`) utilize prepared statements with PDO (e.g. `$pdo->prepare(...)` and `$stmt->execute(...)`). Strict format validation is enforced for inputs (dates are verified using regex and `checkdate`, phone numbers are verified via regex matching length and character constraints, and slot times are checked against a strict whitelist).

### 1.2. Cross-Site Scripting (XSS)
- **Risk Description**: Injection of malicious HTML/JS payloads by outputting user inputs directly into the DOM (DOM-based XSS) or displaying database content without escaping.
- **Mitigation Status**: **Mitigated**
- **Action Taken**: The frontend code leverages standard DOM APIs safely. In `index.html`, sensitive developer comments containing placeholders have been cleaned. Additionally, the backend endpoints use `Content-Type: application/json` headers, ensuring responses are treated strictly as JSON data, which prevents the execution of HTML payloads in the browser response context.

### 1.3. SQLite Database Download Exposure
- **Risk Description**: Storing SQLite databases in the webroot allows direct downloading of the database file (e.g., `api/database.sqlite`), exposing patients' personally identifiable information (PII).
- **Mitigation Status**: **Mitigated**
- **Action Taken**: Configured `.htaccess` file rules to deny all web access to SQLite files (`.sqlite`, `.db`), write-ahead log files (`.sqlite-wal`, `.sqlite-shm`), journal files (`.sqlite-journal`), and database backups/dumps. The rules use conditional blockings compatible with both Apache 2.2 and Apache 2.4 web servers.

### 1.4. Admin Brute Force and Weak Credentials
- **Risk Description**: Hardcoded plaintext administrator credentials (e.g. `'admin123'`) in the PHP source files (`admin.php` and `api/admin_citas.php`) are susceptible to source leakage, repository compromise, and basic brute-force discovery.
- **Mitigation Status**: **Mitigated**
- **Action Taken**: Generated a secure, high-cost BCrypt hash of the administrator password. Updated both `admin.php` and `api/admin_citas.php` to perform authentication using PHP's native `password_verify` function against the secure bcrypt hash. Plaintext passwords have been completely purged from the codebase.

### 1.5. Missing Security Headers
- **Risk Description**: Lack of security headers makes the site vulnerable to clickjacking, MIME-type sniffing, and cross-site scripting (XSS).
- **Mitigation Status**: **Mitigated**
- **Action Taken**: Configured and sent secure HTTP headers in `admin.php` and `api/database.php`:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy` (CSP) custom policies:
    - In `admin.php`: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self';`
    - In `api/database.php` (global database config): `default-src 'none';`

### 1.6. Unencrypted Communication (HTTP)
- **Risk Description**: Patient reservations, contact data, and admin authentication credentials sent over unencrypted HTTP channels are vulnerable to interception and tampering by Man-in-the-Middle (MitM) attacks.
- **Mitigation Status**: **Mitigated**
- **Action Taken**: Configured URL rewriting in `.htaccess` to automatically redirect all incoming HTTP traffic to secure HTTPS.

### 1.7. Console Log Leaks
- **Risk Description**: Verbose developer logs containing error details or server responses in frontend script files can expose system internals or paths.
- **Mitigation Status**: **Mitigated**
- **Action Taken**: Cleaned up code comments in `index.html` and silenced/removed verbose console errors in `main.js`.
