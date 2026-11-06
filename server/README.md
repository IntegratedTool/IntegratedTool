# Help Desk API (Node + PostgreSQL)

Reads the existing tables `resolver_login_eobc`, `resolver_login_hd`, `dealer_login` and `issue_routing_master` (never changes them)
and keeps tickets in its own tables `hd_ticket`, `hd_ticket_event`, `hd_ticket_attachment`.

## One-time set-up (Windows and Mac, Node.js 20+)
1. Edit `db.config.json`: host, port, database, user, ssl mode. **No password in the file**: it is asked (hidden) every time.
   Also set `uploads.dir` to the folder on this machine where attachments should be saved.
2. In the project folder run `npm install`, then `cd server` and `npm install` again (separate packages).
   Repeat only when `package.json` changes (a new zip normally does not need it, but running it again is harmless).
3. `npm run db:check` : connection test; lists tables and the columns of the four tables above (names only, no row data).
4. `npm run db:check -- --hash-test` : type one admin's user name and password; says which hashing method the stored password uses
   (nothing is printed except the method). Put the result in `auth.passwordHash` (or leave `auto`).
5. `npm run db:check -- --routing` : lists routing rows whose `assign_to` has no matching active account in the wing's resolver table.
6. `npm run db:migrate` : creates the ticket tables and the two reference-number sequences (asks you to type YES; safe to repeat).

## Every time
- Terminal 1, in `server`: `npm run dev` (no auto-restart, so the hidden password prompt works; asks for the DB password; API at http://127.0.0.1:4000/api/v1)
- Terminal 2, in the project folder: `npm run dev:db` (portal at http://localhost:5173 using the real server)
- `npm run dev` in the project folder still runs the portal with built-in sample data (no server needed).

## How the rules map to your tables
- Admin login: user name or e-mail in either resolver table, `active_yn` = Y; the typed password is hashed and compared with `password`. Nothing is decrypted.
- Every account in both resolver tables is an Admin. Every administrator can raise tickets on behalf of callers (phone, e-mail, visit); the `ticketCreators` setting is no longer used
  and see Type, Source and Date received.
- Dealer login: GSTIN in `dealer_login` (active), OTP is the **sample** value `auth.sampleOtp`. Nothing is e-mailed.
- Routing: caller type + Nature + Category + Sub-category must match one active row of `issue_routing_master`; its `assign_to` must match exactly one
  active account in the wing's table (EoBC: `adminusername`, HelpDesk: `user_name`). Otherwise the ticket is refused and nothing is created.
- Reference numbers: E000001 (EoBC wing) / H000001 (HelpDesk wing), from database sequences.
- Attachments: PDF/JPEG only (checked from the file's first bytes), max 2 files, 10 MB in total. Saved under `uploads.dir`; the full path and a SHA-256 are stored in `hd_ticket_attachment`.

## Tests
`npm test` runs the server against an in-memory Postgres (no real database touched).

SSL values: in pgAdmin right-click the server > Properties > SSL tab. 'Disable' = `disable`, 'Prefer' = `prefer`, 'Require' = `require`,
'Verify-CA' = `verify-ca`, 'Verify-Full' = `verify-full`; its 'Root certificate' path = `caFile`.
SSH tunnel: open the tunnel first, then set host to 127.0.0.1 and the local forwarded port.

## Release 7: run the new migration
```
npm run db:migrate     # applies sql/002_features.sql (type YES when asked)
npm run dev            # restart the server
```
`db.config.json` may contain `"superAdmins": ["eobc:1"]` (resolver table + id). Only these accounts see the console, dashboard and the Close action.
