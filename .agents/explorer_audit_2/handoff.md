# Handoff Report - Database Security (SQL Injection and SQLite Exposure)

## 1. Observation

We performed a static analysis of the database connection, SQL query usages, and server configuration. Below are the exact file observations:

### A. Database Connection & File Location
*   **File Path**: `api/database.php`
*   **Line 16-19**:
    ```php
    $dbPath = __DIR__ . '/database.sqlite';
    
    try {
        $pdo = new PDO('sqlite:' . $dbPath);
    ```
*   **Significance**: The database file `database.sqlite` is generated in `api/` directory (inside the web root).

### B. SQL Query Usages
*   **File Path**: `api/admin_citas.php`
    *   **Lines 28-32**:
        ```php
        if ($date) {
            $stmt = $pdo->prepare("SELECT * FROM citas WHERE date = ? ORDER BY time ASC");
            $stmt->execute([$date]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM citas ORDER BY date ASC, time ASC");
            $stmt->execute();
        }
        ```
    *   **Significance**: Employs PDO Prepared Statements with positional parameter placeholders `?` and binds inputs using an array to `execute()`. Safe against SQL Injection.

*   **File Path**: `api/disponibilidad.php`
    *   **Lines 17-18**:
        ```php
        $stmt = $pdo->prepare("SELECT time FROM citas WHERE date = ?");
        $stmt->execute([$date]);
        ```
    *   **Significance**: Employs PDO Prepared Statements with positional parameter placeholders `?` and binds inputs using an array to `execute()`. Safe against SQL Injection.

*   **File Path**: `api/reservas.php`
    *   **Lines 131-132**:
        ```php
        $stmt = $pdo->prepare("INSERT INTO citas (name, date, time, phone) VALUES (?, ?, ?, ?)");
        $stmt->execute([$name, $date, $time, $phone]);
        ```
    *   **Significance**: Employs PDO Prepared Statements with positional parameter placeholders `?` and binds inputs using an array to `execute()`. Safe against SQL Injection.

*   **File Path**: `admin.php`
    *   **Observation**: No database connection or SQL queries were found. It relies on the client-side JavaScript `fetch` API querying `/admin/citas`.

### C. Web Access Protection (.htaccess)
*   **File Path**: `.htaccess` (in the root directory)
*   **Lines 3-7**:
    ```apache
    # Block direct web downloads of SQLite database files
    <FilesMatch "\.sqlite$">
        Order deny,allow
        Deny from all
    </FilesMatch>
    ```
*   **Significance**:
    *   Uses deprecated Apache 2.2 syntax (`Order deny,allow` / `Deny from all`). If deployed on Apache 2.4+ (default today) without `mod_access_compat` enabled, this restriction will not work or might cause server configuration issues.
    *   It only matches `.sqlite` file extensions. If temporary/journaling files are created (e.g., `database.sqlite-journal`, `database.sqlite-wal`, `database.sqlite-shm`) or if alternate extensions are used (e.g., `.db`, `.sqlite3`), they remain unprotected.
    *   Non-Apache web servers (like Nginx, IIS) ignore `.htaccess` entirely, exposing the database to direct download.

---

## 2. Logic Chain

1.  **SQL Injection Auditing**:
    *   **Rule**: Direct SQL query execution using string concatenation with untrusted input is vulnerable. PDO Prepared Statements with parameterized placeholders (`?` or `:placeholder`) are safe.
    *   **Observation Reference**: All database interactions in `api/admin_citas.php`, `api/disponibilidad.php`, and `api/reservas.php` use `$pdo->prepare(...)` and pass parameters in `$stmt->execute([...])`.
    *   **Conclusion**: There is no direct SQL string concatenation with user-controlled input in any audited files. Therefore, the codebase is structurally secure against SQL Injection.

2.  **SQLite Exposure Auditing**:
    *   **Rule**: The SQLite database file contains sensitive user information (names, phone numbers, booking times). If stored in a web-accessible directory (like `api/database.sqlite`), it must be blocked from direct download.
    *   **Observation Reference**: The database is stored at `api/database.sqlite`. The only protection is the `.htaccess` rule blocking `\.sqlite$`.
    *   **Analysis of Apache 2.4 & Non-Apache systems**: Modern servers running Apache 2.4+ might fail to block access if compatibility modules (`mod_access_compat`) are disabled. Servers running Nginx/IIS completely ignore `.htaccess`.
    *   **Analysis of Journal/Alternate files**: SQLite engines create `-journal`, `-wal`, or `-shm` files during transactions, which contain data fragments. These are not blocked by the `\.sqlite$` regex pattern.
    *   **Conclusion**: The SQLite database file has potential exposure risks depending on the server type, Apache version configuration, and temporary transaction files.

---

## 3. Caveats

*   Only PHP files specified in the request (`api/database.php`, `api/admin_citas.php`, `api/disponibilidad.php`, `api/reservas.php`, `admin.php`) were audited for SQL injection. Any database connections in other directories (like `booking_system/`) were not part of this specific scope.
*   We assume the production server runs Apache. If the production server is Nginx or IIS, additional server-level configuration blocks must be implemented manually in the server blocks or web.config, respectively.

---

## 4. Conclusion

*   **SQL Injection Status**: **Secure**. No vulnerabilities found. All PHP SQL queries are parameterized using PDO prepared statements.
*   **Database Exposure Status**: **Partially Vulnerable / At Risk**. The SQLite file is located inside the webroot, and the `.htaccess` defense relies on deprecated Apache 2.2 syntax and does not block temporary SQLite transaction/journal files.

### Proposed Fix Strategies:

1.  **Upgrade `.htaccess` Rules**:
    Update the `.htaccess` file to support both Apache 2.2 and Apache 2.4+ and block database backups, journal/WAL files, and alternate SQLite extensions.
    
    *Proposed `.htaccess` replacement snippet:*
    ```apache
    # Block direct web downloads of SQLite database files, journals, and backups
    <FilesMatch "\.(sqlite|sqlite3|db|db3)(\..+)?$">
        <IfModule mod_authz_core.c>
            Require all denied
        </IfModule>
        <IfModule !mod_authz_core.c>
            Order deny,allow
            Deny from all
        </IfModule>
    </FilesMatch>
    ```

2.  **Move the Database Outside the Web Root (Recommended)**:
    Modify `api/database.php` to define the database path outside the web-accessible directory.
    *Example:*
    If the web root is `public_html/`, place `database.sqlite` in `public_html/../data/database.sqlite`.
    
3.  **Use Web Server Rules (Nginx)**:
    If deploying to Nginx, add a rule to block access:
    ```nginx
    location ~ \.(sqlite|db)$ {
        deny all;
    }
    ```

---

## 5. Verification Method

To verify the findings statically and dynamically:
1.  **Static Verification**:
    *   Check `api/database.php` line 16 to confirm the db file is inside the webroot.
    *   Confirm the presence of parameterization (i.e. `?` and `$stmt->execute([...])`) in `api/admin_citas.php`, `api/disponibilidad.php`, and `api/reservas.php`.
2.  **Dynamic Verification**:
    *   Deploy the project on an Apache server.
    *   Verify if `api/database.sqlite` (or a mock file like `api/test.sqlite`) can be downloaded.
    *   Verify if `api/test.sqlite-journal` or `api/test.sqlite.bak` can be downloaded.
    *   If using Apache 2.4 without `mod_access_compat`, check if the server returns a `403 Forbidden` or a `200 OK` (which indicates failure to block).
