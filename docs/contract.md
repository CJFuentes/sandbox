# Part 1: Conventions

*This part is product-neutral. The skeleton ships it as `docs/contract.md`.*

## 1.1 Scope

- This part fixes the conventions every feature follows. Each feature's endpoints, JSON shapes, error codes,
  permissions and `data-testid`s are given in its story, under "Contract". Those are binding too.
- Anything this document and a story's contract leave open is the implementer's choice.
- A story's quoted Rules (behaviour) and its quoted Contract (interface) are meant to agree. Where they seem to
  differ on an interface detail (a path, status, code, property, test id or count of records), the Contract governs.
- The product's acceptance tests are external and black-box (§1.12). They bind only to what is fixed here and in the
  stories.

## 1.2 HTTP API

- **Base path.** Every endpoint is under `/api/v1`.
- **JSON.** Request and response bodies are JSON, except where a feature states another media type (for example
  CSV). JSON responses set `Content-Type: application/json` (a `charset` parameter is allowed).
- **Methods and success statuses.**

  | Request | Success |
  |---|---|
  | `GET` | 200 with the entity or list |
  | `POST` that creates an entity | 201 with the created entity |
  | `POST` to an action path (`.../cancel`, `.../accept`, `.../read`, ...) | 200 with the updated entity, or the body the feature states |
  | `PUT` (full replacement: every required property must be present) | 200 with the full stored object |
  | `PATCH` (partial update) | 200 with the full updated entity |
  | `DELETE` | 204 with an empty body |

- **PATCH semantics.** Only the properties present in the body change. `null` clears a nullable property. `{}` changes
  nothing and still returns 200 with the entity, unless one of the feature's checks rejects the request: those checks
  (visibility, permission, the entity's state) still run for `{}`, in the feature's order (§1.4 Precedence). For
  example, a feature that refuses edits of an entity in some state answers `{}` for such an entity with that error.
- **Request bodies.** Clients send JSON bodies with `Content-Type: application/json`. A request with no body or an
  empty body is treated as `{}`, whatever its `Content-Type`. A non-empty body that is not valid JSON, or not a JSON
  object where an object is expected, gets 400 `VALIDATION_FAILED`. How a non-empty body of another media type is
  answered is not part of this contract.
- **Unknown request properties** are ignored.
- **`null`** is accepted only for properties a feature marks nullable (`T | null`). `null` for any other property gets
  400. It never means "use the default".
- **Response bodies.** A single entity is returned as the bare object, with no envelope. Lists use the envelope in §1.5.
  A few composite responses (for example the auth responses) are defined by their feature. Responses may include
  properties beyond those listed.
- **Unknown routes**, and methods a path does not support, get 404 `NOT_FOUND` as a JSON error.
- **No rate limiting** on any endpoint.

## 1.3 Data formats

- **IDs** are opaque strings. An id that is a string but malformed (for example not a UUID) is treated exactly like an
  unknown id: in a path or a request body it gets 404 `NOT_FOUND`, and as a query filter it matches nothing (§1.7).
  Never 400 or 500. Only a missing id, or an id that is not a string, gets 400. An id in a request body that is empty
  after trimming (`""`, `"  "`) counts as missing: 400.
- **Property names** are camelCase.
- **Instants.**
  - Input: an RFC 3339 date-time with `Z` or a numeric offset, with optional fractional seconds, for example
    `2026-11-02T09:00:00Z` or `2026-11-02T18:00:00+09:00`. Anything else, including a missing offset, gets 400.
  - Output: always UTC, in the form `Date.prototype.toISOString()` produces, for example `2026-11-02T09:00:00.000Z`.
- **Dates** are `YYYY-MM-DD` and must be real calendar dates (otherwise 400).
- **Times of day** are `HH:mm`, 24-hour, zero-padded. `24:00` is allowed only where a feature says so.
- **Time zones** are IANA names (`UTC`, `Asia/Tokyo`, ...). The value is trimmed, then it is valid iff
  `new Intl.DateTimeFormat('en-US', { timeZone: value })` does not throw. It is stored and returned trimmed, otherwise
  exactly as sent (no case or alias normalisation).
- **Intervals** are half-open, `[start, end)`. Two intervals overlap iff `a.start < b.end && b.start < a.end`. Intervals
  that only touch do not overlap.
- **Strings.** Leading and trailing whitespace is trimmed before validation and storage, unless a feature says
  otherwise. A required string that is empty after trimming gets 400. An optional text property that is empty after
  trimming is stored and returned as `null`. Length limits count characters after trimming.
- **Emails** are trimmed and lower-cased. An email is valid iff it matches `^[^\s@]+@[^\s@]+\.[^\s@]+$` and is at most
  254 characters long. Emails are compared in this normalised form.
- **Integers** in a JSON body must be JSON integers: `1.5` and `"3"` get 400. In a query string, an integer is written
  in decimal digits.
- **Query booleans** are exactly `true` or `false`. Any other non-empty value gets 400. An empty value is treated as
  absent (§1.5).
- **Enums** are lower-case strings listed by the feature. Any other value gets 400.
- **Secrets.** Responses never contain password hashes, tokens other than the auth token, or other secrets.

## 1.4 Errors

Every non-2xx response has this body:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "name is required", "details": [ { "path": "name", "message": "Required" } ] } }
```

- `code` comes from the catalogue below or from a feature. `message` is human-readable free text. `details` is optional,
  except where a code requires it.
- **`VALIDATION_FAILED` requires `details`**: at least one entry `{ "path": string, "message": string }`, and every
  entry names an invalid input. Reporting every invalid input is allowed but not required. `path` is the offending
  property's dotted path in the body (`name`, `weeklyHours.2.end`), or the query parameter's name (`limit`). When a rule involves two properties, `path` is the one the feature names (for
  example `endsAt` when `endsAt <= startsAt`). When no property is to blame (malformed JSON), `path` is `""`.
- **Global codes:**

  | Status | `code` | When |
  |---|---|---|
  | 400 | `VALIDATION_FAILED` | The body, query or a date/time value is invalid |
  | 401 | `UNAUTHENTICATED` | A protected route gets a missing, malformed, wrongly signed or expired token |
  | 401 | `INVALID_CREDENTIALS` | Login with an unknown email or a wrong password |
  | 403 | `FORBIDDEN` | The caller can see the target but may not perform the action |
  | 404 | `NOT_FOUND` | Unknown route, or a target that is missing or not visible to the caller |
  | 409 | `EMAIL_TAKEN` | Registration with an email that is already registered |
  | 500 | `INTERNAL` | Unexpected failure |

  Features add their own codes: usually 409 for state conflicts and 422 for business-rule violations on well-formed
  input.
- **Precedence.** On protected routes, 401 beats everything. Where a feature fixes an evaluation order, that order is
  binding. Otherwise, when a request breaks several rules, any one of the applicable errors is correct.

## 1.5 Lists

- Every list endpoint returns `{ "items": [ ... ], "total": 57, "limit": 20, "offset": 0 }`. `total` counts every item
  that matches the filters, ignoring `limit` and `offset`.
- `limit` is 1–100 (default 20) and `offset` is ≥ 0 (default 0). Other non-empty values get 400.
- Order is deterministic. Each list states its sort. Ties are broken by `id` in ascending string order, or by the key
  the feature names for items that have no `id`.
- Filters combine with AND.
- On every endpoint, a query parameter sent with an empty value (`?q=`, `?type=`, `?includeArchived=`, `?limit=`) is
  treated exactly as if it were absent. So an empty filter means "no filter", an empty boolean, `limit` or `offset`
  takes its default, and an empty required parameter counts as missing (400).

## 1.6 Auth and health (implemented in the skeleton)

**User:** `{ "id": string, "email": string, "name": string, "createdAt": instant }`

| Method and path | Auth | Request body | Success | Errors |
|---|---|---|---|---|
| `POST /api/v1/auth/register` | none | `{ email, password, name }`: valid email, password 8–128 characters (not trimmed), name 1–80 | 201 `{ "token": string, "user": User }` | 400, 409 `EMAIL_TAKEN` |
| `POST /api/v1/auth/login` | none | `{ email, password }` | 200 `{ "token": string, "user": User }` | 400, 401 `INVALID_CREDENTIALS` |
| `GET /api/v1/auth/me` | bearer | – | 200 User | 401 |
| `GET /api/v1/health` | none | – | 200 `{ "status": "ok" }` | – |

- The token is a JWT sent as `Authorization: Bearer <token>`. It is valid for at least 24 hours.
- Every endpoint except the four above requires the token. Without a valid one, the answer is 401 `UNAUTHENTICATED`.
- Registration is open, with no email verification. Logout is client-side: the client discards the token.

## 1.7 Visibility and permissions

- A caller sees an entity only when a feature grants it (membership, ownership, ...). An entity the caller cannot see
  behaves exactly like a missing one: 404 `NOT_FOUND`. The response never reveals that it exists.
- 403 `FORBIDDEN` means the caller can see the target, but their role does not allow the action.
- An id in a request body that refers to an entity the caller cannot see gets 404 `NOT_FOUND`.
- An id used as a list or export **filter** in a query string is not checked. An unknown or invisible id simply matches
  nothing.

## 1.8 Side effects and consistency

- Every effect of a request, including side effects that features define (notifications, audit entries, automatic
  promotions), is committed before the response is sent. The next request sees them.
- Writes are atomic: a request that fails changes nothing.
- The API is safe under concurrent requests. Where a feature states a uniqueness or non-overlap rule, the rule also
  holds when requests race.

## 1.9 Web UI conventions

### Routes and session
- Every client-side route is deep-linkable: loading its URL directly, or reloading it, renders that page.
- The session token is kept in `localStorage` under the key **`auth.token`**. A page that loads with a token there is
  signed in. The app may check the token with `GET /api/v1/auth/me`; if the check fails, the app removes the token and
  goes to `/login`.
- A signed-out visit to any route other than `/login` and `/register` redirects to `/login`.
- An unknown route, or a page whose main entity the API reports as 404, renders the element `app-not-found` in place of
  the page content. A page the caller's role may not use (API 403, or the role rule in the feature) renders
  `app-forbidden` in place of the page content.

### `data-testid` grammar

```
testid  = page "-" element [ "-" id ]
page    = kebab        ; the page key the feature gives, e.g. "item-detail"
element = kebab        ; e.g. "submit", "row", "name", "pending-row"
id      = the entity id as returned by the API, or a key the feature defines (weekday, HHmm, tag, ...)
kebab   = [a-z0-9]+ ( "-" [a-z0-9]+ )*
```

- A test id is unique on the page at any moment. App-level ids use the page key `app`, and nav-bar ids use `nav`.
- Every listed test id is required. Implementers may add more, but an added test id must not start with a listed
  row prefix (for example, if a feature lists `items-row-<id>`, no extra id may start with `items-row-`).
- **Placement:** the test id is on the element itself. Inputs, selects and textareas carry it on the `<input>`,
  `<select>` or `<textarea>`. Buttons carry it on the `<button>` and links on the `<a>`. Rows and text elements carry it
  on any visible element whose text content is the value.
- **Rows that are links:** a row described as "a link to X" either is an `<a href>` to X or contains one. The first
  `<a href>` at or inside the row element leads to X.

### Form controls
- **Text input:** `<input>` (text, email, password, search) or `<textarea>`, so that Playwright's `fill` works.
- **Select:** a native `<select>`. Its `<option value>`s are exactly the values the feature lists: API enum values or
  ids. Where the feature lists `""` (for example `""` = any), that option's value is the empty string.
- **Checkbox:** a native `<input type="checkbox">`.
- **Date:** `<input type="date">` (value `YYYY-MM-DD`). **Time:** `<input type="time">` (value `HH:mm`).
  **Date-time:** `<input type="datetime-local">` (value `YYYY-MM-DDTHH:mm`). **Number:** `<input type="number">`.
  The feature says which kind each control is.
- **Time zone of the UI:** every date and time the UI shows or accepts is local to the tenant's timezone, which the
  feature defines. It is never the browser's timezone.

### Forms, errors and actions
- A form is submitted by clicking its submit button.
- Native browser constraint validation (`required`, `type="email"`, `min`, ...) must never silently block a submit.
  Either the form sets `noValidate`, or a blocked submit still renders the form's error element with
  `data-error-code="VALIDATION_FAILED"`.
- While a form shows an error, its error element (named by the feature) is rendered, and its `data-error-code`
  attribute holds the API `error.code`. The element is not rendered when there is no error. Client-side checks may only
  mirror 400 conditions, and then use `data-error-code="VALIDATION_FAILED"`.
- A success element (for example `...-saved`) is rendered after a successful submit, until the next edit or submit.
- An action takes effect when its control is clicked. No confirmation dialogs (`window.confirm`, `alert`) are used,
  unless the feature defines an explicit confirm step.

### Lists
- Row containers are `<page>-row-<id>`, or `<page>-<list>-row-<id>` when a page has several lists. There is one row per
  item, in the order the API returns for the same query. At least the first 20 matching items are shown.
- Cells inside a row are `<page>-<field>-<id>` (or `<page>-<list>-<field>-<id>`).
- The list's empty element (`<page>-empty`, or the name the feature gives) is rendered iff the loaded list has no items.
- A change the user makes on a page shows on that page without a reload.

### Role-based rendering
- A control the caller's role may not use is not rendered at all. It is not merely disabled.

### URL state
- A page with filters reads its initial filter state from the URL query parameters the feature lists. Applying filters
  writes them back to the URL, omitting empty values. Whether default values are written, the parameter order and the
  percent-encoding are free.
- Unless a feature says otherwise, a filter control applies as soon as it changes. A control on a page that gives it
  an apply or submit button takes effect only when that button is clicked.

### Rendered values
- An element bound to an **enum** has trimmed text equal to the API value, compared case-insensitively. Labels go
  outside the element.
- An element bound to a **name, title or email** has trimmed text equal to the stored value.
- An element bound to **any other stored string** (for example a timezone, a location, a description, notes or a
  reason) has trimmed text equal to the stored value. Labels go outside the element.
- A text input or textarea that the feature says is prefilled holds the stored string as its value.
- An element bound to an **integer or count** has trimmed text that is the decimal integer.
- A **time of day** is rendered `HH:mm` in 24-hour form.
- An element bound to a `null` value either is omitted or has empty text.

### App-level test ids
`app-not-found`, `app-forbidden`.

## 1.10 Skeleton UI

| Route | Page key | Test ids |
|---|---|---|
| `/login` | `login` | `login-email`, `login-password`, `login-submit`, `login-error` (with `data-error-code`), `login-register-link` |
| `/register` | `register` | `register-name`, `register-email`, `register-password`, `register-submit`, `register-error` (with `data-error-code`), `register-login-link` |
| `/` | `home` | `home-greeting` (its text contains the user's name) |
| every signed-in page | `nav` | `nav-home` (link to `/`), `nav-user` (its text contains the user's email), `nav-logout` |

- After a successful login or registration, the app stores the token and navigates to `/`.
- `nav-logout` removes the token and navigates to `/login`.
- Features add their own nav links as `nav-<name>`.

## 1.11 Data, migrations and runtime

- The app starts from an empty PostgreSQL 16 database. Every schema change ships as a migration that the migrate
  command applies, and the full set of migrations must apply to an empty database. No seed data is required or assumed.
- The install, migrate, build, start, dev, test and e2e commands, the ports and the environment variables documented
  in the skeleton's `CLAUDE.md` are part of this contract. They must keep working unchanged.
- The app needs only PostgreSQL: no other service, no background worker, no network access.

## 1.12 External acceptance tests

- Acceptance tests drive the app only over HTTP against the API and in a browser against the web app. They import no
  app code, do not touch the database and do not change the server clock.
- They create their own data through the API, registering fresh users with unique emails. They may run concurrently
  against one server and one database. The app must not assume that it has a single user or a single tenant.
- They may sign in by setting `localStorage["auth.token"]` before a page loads.
- They bind to paths, methods, status codes, `error.code`, `details[].path`, JSON property names, types and values,
  the headers a feature states, test ids, the attributes a feature states, and URLs. They do not bind to message texts,
  labels, styling or layout.
