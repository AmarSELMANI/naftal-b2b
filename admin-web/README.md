# Naftal — agent console

The web side of the approval workflow: a Naftal agent signs in, reads an
applicant's company details and supporting documents, and approves or denies.
French first, with an EN toggle.

## Run

The API must already be running on port 3100 (see [`../backend/README.md`](../backend/README.md)).

```bash
cd admin-web
npm install
npm run dev        # http://localhost:5173
```

Sign in as `admin`. The password is whatever the backend seed printed (or
whatever you set as `SEED_ADMIN_PASSWORD`) — there is no default.

To point at a deployed API instead of localhost, set `VITE_API_URL`:

```bash
VITE_API_URL=https://naftal-api.fly.dev/v1 npm run dev
```

## The demo this enables

1. Register a company on the phone (or with `npm run test:e2e` in `backend/`).
2. The request appears under **En attente** here within 30 seconds — the queue
   polls, so you do not have to refresh in front of your jury.
3. Open it, view the uploaded documents, click **Approuver la demande**.
4. The phone advances immediately: it is holding an SSE connection to
   `/v1/account-requests/mine/stream`, so the decision is pushed, not polled.

## Notes

**Documents never have a public URL.** An `<img src>` cannot load one, because
the bytes only come from `GET /v1/admin/documents/:id` behind a staff role check.
The console fetches them with the auth header and renders the result as a blob
URL, which is revoked when you close the request. The API returns 401 without a
token and 403 for a customer's token — both covered by the backend test suite.

**Tokens live in `sessionStorage`, not `localStorage`.** An agent reviewing ID
cards and bank statements should not leave a session behind in a browser someone
else reopens. A 401 anywhere triggers one refresh attempt, then drops to the
sign-in screen.

**Approval takes no credit input.** The 1,250,000 DA ceiling is Naftal policy
held in `app_settings`, not an agent decision — the form has no field for it, and
the API would ignore one. Only an `admin` can change the policy, via
`PATCH /v1/admin/settings`.

**Strings are keyed, never parsed.** Errors are localised from the API's
`error.code`, so the backend stays language-agnostic and FR/EN switches with no
refetch. Adding a language means one more block in `src/i18n.js`.

## Layout

```
src/
  api.js       fetch wrapper: auth header, 401 -> refresh -> retry, blob fetch
  i18n.js      fr/en dictionaries, keyed by error code for API failures
  App.jsx      session + language shell
  pages/
    Login.jsx          staff-only sign-in
    Queue.jsx          pending / approved / denied, self-refreshing
    RequestDetail.jsx  company, applicant, documents, approve or deny
```
