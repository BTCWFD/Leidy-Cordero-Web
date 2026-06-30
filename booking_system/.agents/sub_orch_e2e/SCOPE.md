# Scope: E2E Testing Track

## Architecture
The E2E Testing Track designs a comprehensive, opaque-box, requirement-driven test suite.
It produces:
- `TEST_INFRA.md` - Test architecture, feature inventory, methodology, and coverage goals.
- `TEST_READY.md` - Signal that the test suite is ready, with a coverage summary and test execution commands.
- `test_booking.js` - The test script implementing the tests.

## Features under Test
1. **F1: Clinic Available Slots Display** (Patient UI shows available slots).
2. **F2: Patient Booking Form Submission** (Patient fills form, submits, server saves and returns success).
3. **F3: Local Database Persistence** (Appointment data saved to local SQLite/JSON database file, size > 0).
4. **F4: Administrative View Endpoint** (HTTP GET `/admin/citas` returns appointments).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Test Infra & Specs | Define directory structure, setup test framework, document feature inventory in `TEST_INFRA.md` | None | DONE |
| 2 | Tier 1 & 2 Test Suite | Implement Tier 1 (Feature Coverage >= 20 cases) and Tier 2 (Boundary Cases >= 20 cases) tests | M1 | DONE |
| 3 | Tier 3 & 4 Test Suite | Implement Tier 3 (Cross-feature >= 4 cases) and Tier 4 (Real-world >= 5 cases) tests | M2 | DONE |
| 4 | Final Verification | Verify test runner, publish `TEST_READY.md` | M3 | DONE |

## Interface Contracts
- The test harness uses only public HTTP endpoints of the server:
  - `GET /`
  - `POST /api/reservas` (or custom endpoint as configured in project)
  - `GET /admin/citas`
- The test harness checks file size and presence of the DB file.
