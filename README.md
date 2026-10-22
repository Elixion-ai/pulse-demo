# Pulse

A simple public changelog and status page, served as a static site from GitHub Pages.

- Plain HTML, CSS and vanilla JavaScript. No build step, no dependencies, no backend.
- All content lives in `data/changelog.json`: current status, releases and incident history.
- Every change is a pull request to `main`; GitHub Pages publishes the result about a minute after merge.

## Files

| file | purpose |
|---|---|
| `index.html` | page structure: status card, changelog, incident history |
| `styles.css` | light theme, CSS custom properties, responsive layout |
| `app.js` | fetches the JSON and renders it |
| `data/changelog.json` | the content |

## Editing content

Add a release to the `releases` array (newest entries can go anywhere; the page sorts by date):

```json
{ "version": "1.3.0", "date": "2026-10-25", "title": "…", "tag": "Feature", "description": "…" }
```

Tags in use: `Feature`, `Fix`, `Improvement`, `Breaking`. Status levels: `operational`, `degraded`, `outage`.

## Local preview

Open `index.html` through any static server (the page fetches JSON, so `file://` won't work in most browsers):

```sh
python3 -m http.server 8080
```

This project is managed in Elixion; tasks are implemented by AI agents through pull requests.

## CI and deployment

- `CI / validate` runs on every pull request: it checks `data/changelog.json` against the shape `app.js` expects, syntax-checks `app.js`, and serves the site to make sure every asset loads.
- `Deploy to GitHub Pages` runs on every push to `main` and publishes the site. It writes `data/deploy.json` with the deployed commit so the page can show which commit is live.

Changes land through pull requests. Elixion merges an issue's pull request when the issue is moved to Done; the deploy workflow then publishes it within about a minute.
