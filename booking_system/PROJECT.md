# Project: Quiropodia LC Booking System

## Architecture
The system is built as a lightweight Node.js web application:
- **Express Web Server**: Listens for HTTP requests. Serves static patient UI and defines the endpoints.
- **Database Engine**: Local persistent SQLite/JSON store. Requires no credentials.
- **Patient Frontend**: An interactive web form to select date/time and fill in booking details.
- **Admin View**: Route `/admin/citas` displaying a list of bookings for the current day.
- **Test Harness**: An automated E2E script `test_booking.js` verifying the entire flow.

## Code Layout
- `server.js` — Core web server and routing.
- `package.json` — Dependency management.
- `database.js` — Persistent SQLite or JSON management module.
- `public/` — Patient web UI files.
  - `public/index.html` — HTML Form and available slots display.
  - `public/style.css` — Basic styling.
  - `public/client.js` — Client-side booking submission and API calls.
- `test_booking.js` — Automated E2E verification script.

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | E2E Testing Track | Comprehensive E2E test suite designing & infra. Publishes `TEST_READY.md`. | None | DONE | 5ab59a5a-afa5-477c-b350-439169a9ec17 |
| 2 | Backend & DB Setup | Initialize package, DB schema, express server structure, basic routes | None | DONE | 54848d25-c1ec-471c-92c8-bb0c259daf2a |
| 3 | Patient Booking UI & API | Implement booking API post and patient form web UI | M2 | DONE | 54848d25-c1ec-471c-92c8-bb0c259daf2a |
| 4 | Admin View UI & Endpoint | Implement administrative route and data presentation | M2 | DONE | 54848d25-c1ec-471c-92c8-bb0c259daf2a |
| 5 | E2E Integration & Verification | Merge backend/frontend and verify all E2E test cases pass | M1, M3, M4 | DONE | 9fefbc5f-3924-4b11-a677-e9a2fcc20b20 |
| 6 | Adversarial Hardening | Coverage audit and robustness test against edge-cases | M5 | DONE | 9fefbc5f-3924-4b11-a677-e9a2fcc20b20 |

## Interface Contracts
### Booking API
- `POST /api/reservas`
  - Description: Create an appointment.
  - Request body: `{ name: string, date: string, time: string, phone: string }`
  - Response (success): `200 OK` with JSON `{ success: true, bookingId: string }`
  - Response (error): `400 Bad Request` or `500 Server Error` with JSON `{ success: false, error: string }`

### Admin View API
- `GET /admin/citas`
  - Description: List appointments.
  - Response: `200 OK` with JSON array of bookings: `[{ id: number/string, name: string, date: string, time: string, phone: string }, ...]`
