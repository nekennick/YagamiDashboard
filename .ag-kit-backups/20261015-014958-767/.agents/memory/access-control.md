---
type: project
created: 2026-10-07
---

# Access Control

- `ADMIN` has access to all pages and APIs.
- `MEMBER` can access only `/order-schedule`, `/stocktake`, and the daily-inventory APIs required to save stocktake entries.
- Initial admin username is `admin`; the initial password comes from ignored `.env` variable `AUTH_INITIAL_ADMIN_PASSWORD`.
- User management is at `/settings/users` for admins.
