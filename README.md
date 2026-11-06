# Integrated Helpdesk Portal: Login Page (Stage 1 + 2 prototype)

Commercial Taxes Department, Government of Tamil Nadu. React 18 + TypeScript + Vite.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # validation + mock service rule tests
npm run build      # type-check + production build into dist/ (served by NGINX)
```

Fonts (Noto Sans, Noto Sans Tamil) are bundled through npm, so the build needs no external font CDN.

## What is in this prototype

- Bilingual (தமிழ் / English) header, announcements, login card, help panel and footer; language is remembered.
- Admin / Officers / Dealer / Other Users tabs (ARIA tabs, arrow keys); Other Users has Registered Users Login and New Registration.
- Password login (Admin, Officer, Registered): CAPTCHA (image, refresh, audio) appears only after the first incorrect attempt, as signalled by the server.
- Officer: block after 3 wrong passwords, Send OTP to the registered email (masked), unblock without auto-login.
- Dealer: GST/VAT type, GSTIN/TIN, masked registered email + access confirmation, OTP login (no password).
- Registration (email OTP) and Forgot Password (masked confirmation, OTP, new password).
- Common OTP rules: 2 min validity, 60 s resend, 5 wrong attempts -> 20 min lock, resend keeps the counter.

## Simulated (not real)

| Item | Status |
|---|---|
| Officer / other sign-in, dealer OTP, GSTIN lookup, registration, recovery | **Mock** (`src/services/mockApi.ts`), banner shown while `VITE_USE_MOCK` is not `false` |
| Announcements | **Sample placeholders**, labelled "Sample" |
| Demo values | Never shown on the page; listed below for reviewers |

The mock never runs in production: set `VITE_USE_MOCK=false` and the UI calls the Spring Boot API through `src/services/httpApi.ts`
(proposed endpoints under `/api/v1/auth/...` and `/api/v1/public/announcements`). Components only depend on `src/services/types.ts`.

## Placeholders to replace (nothing is invented)

- **Emblem:** place the department-approved file at `public/emblem.png`. Until then a labelled "Emblem" placeholder shows.
- **Contact details, FAQ / manual / query links, footer policy links, last-updated date:** `src/config/site.ts` (null = "To be notified").
- **Tamil text:** working translations in `src/i18n/ta.ts`; must be reviewed by the department before release.
- **Policy switches:** `allowRememberUsername` (off), `selfRegistrationEnabled` (on) in `src/config/site.ts`.

## Structure

```
src/
  components/   DepartmentHeader, LanguageSwitcher, UserTypeSelector, PasswordLoginForm, OfficerLogin,
                DealerLogin, CaptchaField, OtpPanel, RegistrationFlow, ForgotPasswordFlow,
                PublicAnnouncementPanel, HelpContactPanel, AccessibleNotification, DepartmentFooter, LoginCard
  services/     types (API contract), mockApi, httpApi
  i18n/         en, ta, provider
  config/       site.ts (central configuration)
  styles/       global.css (design tokens + components)
```

## Notes

- Client-side validation is a usability aid only; the backend must re-validate everything, enforce throttling, OTP rules and sessions.
- The session is intended to be an HttpOnly cookie set by the backend; nothing secret is kept in JS or localStorage (only the language, and the username if policy enables it).
- GIGW / WCAG 2.1 AA compliance is **not** claimed. Formal verification and the checklist belong to Stage 5.


## Demo values (mock mode only)

| Purpose | Value |
|---|---|
| Admin | `admin.demo@tn.gov.in` or `Admin Helpdesk` / `Demo@Admin12` |
| Officer | GPF `0012345` / `Demo@Officer1` (registered email officer.demo@tn.gov.in) |
| Registered user | `user.demo@example.com` / `Demo@User123` |
| Dealer GST / VAT | `33ABCDE1234F1Z5` / TIN `33123456789` |
| Dealer with no email | `33ZZZZZ9999Z1Z9` |
| Any OTP | `123456` |

Failure counters (CAPTCHA requirement, officer block, OTP lock) persist in `localStorage` in the prototype so they survive a refresh. Clear site data to reset. These are NOT security controls: the real backend must enforce all of them server-side. CAPTCHA audio in the mock uses browser speech; production must play a server-generated audio file.


## Tickets (28 Oct requirements, sections 2-3)

Built: role side menus, Raise a Ticket (dynamic Nature / Category / Subcategory, GSTIN/TIN, hardware, network, GST and task fields, attachments), My Raised Tickets, Assigned Tickets (New / In Progress / On Hold / Resolved / Deleted / Reopened), Helpdesk Review / Assignment (Admin only), filters, ticket details with permission-filtered Action History, Assignment / Transfer History and Original / Transferred (Admin only), and the workflow actions (start, remark, hold, resume, resolve, reopen, delete, send to Helpdesk, reassign).

Mock data (`src/services/ticketMasters.ts`, `ticketMock.ts`) is sample only and lives in memory (lost on refresh). Routing: GST Returns -> Demo Officer; Registration -> Sample Officer B; Task Transfer -> Sample Officer C; Login/Access and Hardware -> Admin Helpdesk; LAN/Internet -> Sample Officer B; **Network / VPN is deliberately unmapped** to show the explicit routing-failure message.

Not built (by decision or because the document defers it): similar-ticket check (on hold), DOCX uploads (excluded), Dashboard / MIS / My Profile (separate documents), notifications, Section 3.16 items.

## Real database mode (Node server in `server/`)
See `server/README.md`. Short version: `cd server && npm install`, edit `db.config.json`, `npm run db:check`, `npm run db:migrate`, `npm run dev`;
then in the project folder `npm run dev:db`. Sign in as Admin (footer link "Admin Login") with a resolver account, or as a Dealer with a GSTIN and the sample OTP.

## Release 7 additions (6 Nov)
- **Ticket lifecycle**: New → In Progress / On Hold → Resolved → Closed, plus Withdrawn. The raiser can *withdraw* only while the ticket is New; only the Super Admin can *close* a Resolved ticket; the raiser can *reopen* within 7 days of Resolved; Resolved tickets that are not reopened or closed are closed automatically after 7 days (server job, every 15 minutes). "Delete Ticket" no longer exists.
- **Comments / queries** can be added by the raiser, the assignee or the closer until the ticket is final. History is shown latest first.
- **Case details**: 20–1,000 words with a live counter. Only characters that can carry markup, script or shell tricks are refused (`< > ` \ { } | $`, plus `^ ~ ; " = % *` in short fields; see `src/utils/inputPolicy.ts`). SQL is always parameterised.
- **Attachments**: file type is checked from the file's real bytes, names must be different, hidden executable extensions and PDFs with scripts are refused.
- **Repeated cases**: a normalised Levenshtein similarity against the raiser's own *open* cases of the same classification (default: warn at 85 %, 30-day look-back).
- **Sign-in**: GSTIN 15-character structure + check character, TIN 11 digits; OTP limited to 3 wrong entries and 3 resends.
- **Super Admin console** (side menu → Super Admin Console) switches features on/off and changes limits; every change is logged in `hd_setting_log`.
- **Dashboard & Reports** with wing / year / month / caller filters and CSV export.
- **Header / login page**: Tamil and English titles side by side, tab title starts with "Government of Tamil Nadu", live IST date and time, accessibility toolbar (text size, high contrast, underline links).
- The Super Admin is the account listed in `superAdmins` in `server/db.config.json` (`["eobc:1"]` until the JC – EoBC account id is confirmed). Mock mode shows the demo admin as Super Admin but the console and dashboard need the database server.

- **Every administrator can raise tickets** on behalf of callers (phone, e-mail, in-person): they choose caller type, Type, Source and Date received.
