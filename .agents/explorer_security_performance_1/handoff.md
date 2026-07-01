# Handoff Report: Security & Performance Audit

This report presents a thorough Security and Performance audit of the Quiropodia LC website root files and the booking system sub-project, based on static source code and asset analysis.

---

## 1. Observation

### 1.1 Local File Listing & Sizes
Using the `list_dir` tool on the workspace root (`c:\Program Files\PROYECTOS DE PROGRAMACION\laidy-cordero`), the following file sizes were observed:
- `index.html`: 10,229 bytes (~9.99 KB)
- `style.css`: 8,590 bytes (~8.39 KB)
- `main.js`: 2,859 bytes (~2.79 KB)
- `logo.png`: 715,135 bytes (~698.37 KB)
- `logo-1.png` (unused): 432,039 bytes (~421.91 KB)
- `lenguaje.jpeg` (unused): 109,491 bytes (~106.92 KB)
- `SCREEN-MOVIL.jpeg` (unused): 84,342 bytes (~82.37 KB)
- `quiropodia lc-logo.jpeg` (unused): 26,035 bytes (~25.42 KB)
- `deploy.js` (FTP deployer): 1,658 bytes (~1.62 KB)

Using the `list_dir` tool on the booking system sub-directory (`booking_system/public`):
- `booking_system/public/index.html`: 1,795 bytes (~1.75 KB)
- `booking_system/public/style.css`: 7,352 bytes (~7.18 KB)
- `booking_system/public/client.js`: 5,587 bytes (~5.46 KB)
- `booking_system/public/admin.html`: 4,577 bytes (~4.47 KB)

### 1.2 Security Observations
- **Missing `rel="noopener"` or `rel="noreferrer"` on External Link**
  - **File Path**: `index.html`
  - **Line Number**: 139
  - **Verbatim Code**:
    ```html
    📱 Escríbenos al <strong><a href="https://wa.me/3204781811" target="_blank" style="color: var(--primary-color); text-decoration: none;">320 478 1811</a></strong>
    ```
- **Disabled SSL Certificate Verification in Deployment**
  - **File Path**: `deploy.js`
  - **Line Number**: 17
  - **Verbatim Code**:
    ```javascript
    secureOptions: { rejectUnauthorized: false }
    ```
- **Unauthenticated Booking Admin Endpoint and Frontend Page**
  - **File Path**: `booking_system/server.js`
  - **Line Numbers**: 110–122
  - **Verbatim Code**:
    ```javascript
    app.get('/admin/citas', async (req, res) => {
      try {
        let date = req.query.date;
        if (Array.isArray(date)) {
          date = date[0];
        }
        let bookings;
        if (date) {
          bookings = await db.getBookings(date);
        } else {
          bookings = await db.getAllBookings();
        }
        res.status(200).json(bookings);
    ```
  - **File Path**: `booking_system/public/admin.html`
  - **Line Numbers**: 58–64
  - **Verbatim Code**:
    ```javascript
    let url = '/admin/citas';
    if (dateVal) {
      url += `?date=${encodeURIComponent(dateVal)}`;
    }

    try {
      const response = await fetch(url);
    ```
- **Lack of Validation Patterns on Input Fields**
  - **File Path**: `index.html`
  - **Line Number**: 148
  - **Verbatim Code**:
    ```html
    <input type="tel" id="phone" required>
    ```
- **Potential XSS Injection Vector via Server Errors in client.js**
  - **File Path**: `booking_system/public/client.js`
  - **Line Number**: 77
  - **Verbatim Code**:
    ```javascript
    slotsContainer.innerHTML = `<p class="error-text">Error: ${data.error || 'No se pudieron cargar los horarios.'}</p>`;
    ```

### 1.3 Performance Observations
- **Render-Blocking External Fonts**
  - **File Path**: `index.html`
  - **Line Number**: 10
  - **Verbatim Code**:
    ```html
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    ```
- **Broken Navbar Link List Markup & Unused CSS Rules**
  - **File Path**: `index.html`
  - **Line Numbers**: 18–24
  - **Verbatim Code**:
    ```html
            </div>
                <li><a href="#inicio">Inicio</a></li>
                <li><a href="#servicios">Servicios</a></li>
                <li><a href="#nosotros">Nosotros</a></li>
                <li><a href="#testimonios">Testimonios</a></li>
                <li><a href="#faq">FAQ</a></li>
            </ul>
    ```
  - **File Path**: `style.css`
  - **Line Numbers**: 71–86, 443–445
  - **Verbatim Code**:
    ```css
    .nav-links {
        display: flex;
        list-style: none;
        gap: 2rem;
    }
    .nav-links a { ... }
    .nav-links a:hover { ... }
    ```
- **Synchronous Script Execution Placement**
  - **File Path**: `index.html`
  - **Line Number**: 188
  - **Verbatim Code**:
    ```html
    <script src="main.js"></script>
    ```

---

## 2. Logic Chain

### 2.1 Security Logic Chain
1. **Reverse Tabnabbing (Line 139 in `index.html`)**: When using `target="_blank"` without `rel="noopener"`, the new browser window gains access to the spawning window's context via `window.opener`. A compromised external destination (like a hijacked link or redirect) could exploit this to change the location of the origin tab, leading to phishing attacks.
2. **Insecure Deployment (Line 17 in `deploy.js`)**: The option `rejectUnauthorized: false` forces the basic-ftp client to accept any SSL/TLS certificate provided by the host, even if it is self-signed or invalid. This bypasses encryption verification, enabling a Man-in-the-Middle (MitM) attacker on the network to intercept FTP credentials or modify the HTML/JS/CSS files being deployed.
3. **Data Leakage in Booking Admin (Lines 110–122 in `server.js`)**: The GET endpoint `/admin/citas` queries the database for patient booking details (name, date, time, phone) and returns them as a JSON array. Because this endpoint does not require any credentials, API tokens, or session checks, anyone accessing `/admin/citas` or `/admin.html` can read all registered bookings, violating privacy regulations.
4. **Weak Input Validation (Line 148 in `index.html`)**: The contact form lacks validation constraints beyond `required`. The `tel` input type doesn't restrict formatting. An attacker or a spam bot can submit arbitrary text, leading to database contamination or script injection depending on downstream handling.
5. **DOM-based XSS Risk (Line 77 in `client.js`)**: Rendering error responses directly via `innerHTML` opens up a vulnerability. If an API request results in a server error that reflects input data (such as a malformed parameter echoed in the error message), an attacker could inject an HTML/JS payload which will be evaluated and executed in the client context.

### 2.2 Performance Logic Chain & Metrics
1. **Unoptimized Navigation Logo (`logo.png`)**:
   - `logo.png` is **715,135 bytes (~698.37 KB)**.
   - It is displayed in the navigation bar with `height: 40px` (line 60 of `style.css`).
   - Resizing the image to a height of 80px (for retina display density) and compressing it as a PNG or WebP would reduce its size to **~15 KB**.
   - Net savings: **683.37 KB (a ~98% reduction)**.
2. **Unused Root Images (Bloat)**:
   - `logo-1.png` (421.91 KB), `lenguaje.jpeg` (106.92 KB), `SCREEN-MOVIL.jpeg` (82.37 KB), and `quiropodia lc-logo.jpeg` (25.42 KB) are not referenced in the HTML/CSS code or deployed via `deploy.js`.
   - Removing these from the root directory saves **636.62 KB** in project size.
3. **Lack of Code Minification**:
   - `index.html` (9.99 KB), `style.css` (8.39 KB), and `main.js` (2.79 KB) are raw text.
   - Standard minification removes comments and whitespaces, typically reducing sizes by:
     - `index.html`: ~2.23 KB savings (22%)
     - `style.css`: ~3.59 KB savings (40%)
     - `main.js`: ~1.36 KB savings (47%)
     - Total potential code savings: **7.18 KB**.
4. **Invalid DOM Parsing**:
   - The missing `<ul class="nav-links">` tag at line 18 of `index.html` breaks list container integrity.
   - The browser has to trigger layout correction algorithms to draw the list items, causing unnecessary style recalculations, reflows, and rendering lag. Additionally, this prevents `.nav-links` CSS styles (flex container, list reset, gap sizing) from applying, breaking the navigation bar layout.
5. **Synchronous Script Load**:
   - Loading `main.js` at the bottom of the body works to prevent blocking initial HTML layout, but delays script compilation and execution. Moving the tag to the `<head>` with the `defer` attribute allows parallel downloads while preserving execution order.

### 2.3 Connection Speed Simulation Calculations
- **Deployed Assets Total Size**:
  - Current: `index.html` (10.23 KB) + `style.css` (8.59 KB) + `main.js` (2.86 KB) + `logo.png` (715.14 KB) = **736.82 KB (736,813 bytes)**.
  - Optimized: `index.html` (8.00 KB) + `style.css` (5.00 KB) + `main.js` (1.50 KB) + `logo.png` (15.00 KB) = **29.50 KB (29,500 bytes)**.
  - Net Size Savings: **707.32 KB (a ~96% payload reduction)**.

- **Speed Constants**:
  - **Slow 3G**: 400 Kbps = 50,000 bytes/sec
  - **Fast 3G (1.5 Mbps)**: 1,500,000 bps = 187,500 bytes/sec
  - **Slow 4G**: 9,000,000 bps = 1,125,000 bytes/sec

- **Simulated Load Time Comparison (Transfer time only)**:
  | Connection Speed | Current Page Load Time | Optimized Page Load Time | Net Time Saved |
  | :--- | :--- | :--- | :--- |
  | **Slow 3G (400 Kbps)** | 14.74 seconds | 0.59 seconds | **14.15 seconds** |
  | **Fast 3G (1.5 Mbps)** | 3.93 seconds | 0.16 seconds | **3.77 seconds** |
  | **Slow 4G (9.0 Mbps)** | 0.65 seconds | 0.026 seconds | **0.62 seconds** |

---

## 3. Caveats

- **External Script Latency**: The audit focuses on local static assets. The metrics exclude third-party request latencies from Google Fonts CDN and Google Maps Embed. Iframes like Google Maps load significant amounts of external JS/CSS (usually over 500 KB), which increases the real-world initial load times unless deferred or lazyloaded.
- **Image Metadata**: Image dimensions and internal compression ratios could not be verified programmatically via `run_command` because the permission prompt timed out (a fallback evaluation based on file extensions, sizes, and CSS display bounds was used instead).

---

## 4. Conclusion

The website shows high-quality frontend styling and animation structures but suffers from major security issues in deployment settings and booking access, along with performance bottlenecks from unoptimized logo asset sizes and invalid markup.

### 4.1 Recommended Security Fixes
1. **index.html:139**: Add `rel="noopener noreferrer"` to the WhatsApp anchor link.
2. **deploy.js:17**: Replace `rejectUnauthorized: false` with `rejectUnauthorized: true` to prevent MitM attacks on FTP.
3. **booking_system/server.js:110**: Implement a token-based or session-based authentication middleware on the `/admin/citas` route, and guard `admin.html` behind a login check.
4. **booking_system/public/client.js:77**: Change the error output assignment to `.textContent` instead of `.innerHTML` to eliminate the DOM-based XSS risk.
5. **index.html:148**: Add phone validation parameters such as `pattern="[0-9]{7,15}"` to sanitize user inputs on submission.

### 4.2 Recommended Performance Fixes
1. **logo.png**: Resize and compress `logo.png` to an optimized WebP or PNG format (target size < 20 KB).
2. **index.html:18**: Insert the opening `<ul class="nav-links">` tag before the list items (`<li>`) to correct the invalid HTML syntax and restore layout styling.
3. **Root Assets**: Delete unused root images (`logo-1.png`, `lenguaje.jpeg`, `SCREEN-MOVIL.jpeg`, `quiropodia lc-logo.jpeg`) to clean the workspace and avoid accidental deployment.
4. **index.html:188**: Move the script link to the `<head>` and add the `defer` attribute.
5. **Minification**: Compile minified versions of CSS, JS, and HTML for production deployments.

---

## 5. Verification Method

To independently verify the observations, check the following files and lines:
1. **Broken HTML Markup**: Open `index.html` and inspect lines 18–25. Verify that `<li>` elements are direct children of `<nav>` without an opening `<ul>` tag.
2. **Unoptimized Logo File Size**: Run a file properties check or listing on `logo.png` in the root folder. Verify that the file size is indeed **715,135 bytes**.
3. **FTP Security Vulnerability**: Open `deploy.js` and locate line 17. Verify that `rejectUnauthorized` is set to `false`.
4. **Booking System Security Vulnerabilities**:
   - Open `booking_system/server.js` and inspect lines 110–122. Verify that there is no session or authentication check guarding the `/admin/citas` GET route.
   - Open `booking_system/public/client.js` and inspect line 77. Verify that `data.error` is appended directly to `innerHTML`.
