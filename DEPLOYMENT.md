# Current deployment workflows

Use the workflows on `Diwas03/TER` main. This is a static JavaScript PWA, not a Vite app. There is no npm dependency installation or frontend bundling step.

## Website

**Deploy TER PWA to GitHub Pages** runs automatically when PWA/build-script files change. It copies static files, optionally injects public project defaults, and deploys the Pages artifact. It uses a pinned Ubuntu 24.04 runner, a 10-minute execution limit and a 5-minute Pages polling limit. Newer website runs supersede older website deployments.

Optional repository **Actions variables**:

- `VITE_SUPABASE_URL`: `https://figymesgyoritaokpwug.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY`: public `sb_publishable_...` key
- Alternatively `VITE_SUPABASE_ANON_KEY`: public legacy anon JWT

The VITE names are accepted for compatibility; this repository does not use Vite. Missing variables do not fail deployment: the app offers Connection settings. A supplied privileged/invalid key fails the build instead of publishing credentials. Publishable keys are sent in the apikey header, not as bearer JWTs; private session JWTs are used separately for push settings. If realtime cannot connect with project settings, REST polling continues.

Pages must be enabled with source **GitHub Actions**, and the account must support Pages for the repository's visibility. These account prerequisites cannot be fixed by a build script. Expected site URL after successful deployment: https://diwas03.github.io/TER/ . A green deployment and a successful visit are required before calling a new version live.

## Supabase collector

**Deploy Supabase price collector** runs automatically when backend/deployment files change and can also be started manually. Required GitHub **Actions secrets** remain `SUPABASE_ACCESS_TOKEN` and `COLLECTOR_SECRET`. Invalid/missing secrets are checked before downloading the Supabase CLI. The CLI configures private collector/push keys and bundles/deploys via the management API (`--use-api`), avoiding Docker startup. Runs serialize to avoid concurrent secret updates, and execution is limited to 10 minutes. Current CLI remote/confirmation flags are used. No SQL migrations are automatically applied.

Apply database/schedule upgrades in Supabase SQL Editor using the linked instructions in DASHBOARD_UPGRADE.md and PUSH_SETUP.md. A successful code deployment does not create the schema or activate a changed cron schedule. Existing collection continues independently of GitHub workflow queues unless its project has another issue.

## Optional manual monitor

The older **TER price alert** Actions workflow now runs only on manual dispatch, using Python's standard library. It does not download Playwright, Chromium, a container image or Python packages. Supabase is the primary scheduled collector; running both can create duplicate observations or alerts. The manual workflow defaults to dry-run.

## If a run is slow

- **Queued / waiting for runner:** code has not started. Check GitHub Status, billing/minutes, runner availability or environment approval notices. The execution timeout does not limit queue time.
- **Waiting for deployment/environment approval:** inspect the github-pages environment's protection settings. Do not bypass required approvals.
- **Running:** expand the active step and use its error/output, not the generic “exit code 1” annotation.
- **Failed:** fix the specific step; start a NEW run on main after workflow code changes. Re-running old jobs uses the old workflow revision.

I could read GitHub main through its Git proxy but GitHub's management API was forbidden in the development environment. Live run status, repository Actions variables and current platform incidents therefore could not be verified here. A pasted validation command requiring sb_publishable_ did not appear anywhere on current main before these changes, so its exact origin remains unknown.

## Local checks

```sh
node --test tests/*.test.mjs
.venv/bin/python -m unittest discover -s tests -v
node scripts/build-pages.mjs /tmp/ter-pages-fresh-output
```

The build output must not already exist. Tests exercise both public key formats, missing variables, privileged-key rejection, realtime fallback, quote parsing and alert rules. Browser checks use mocked Supabase data; they do not verify a hosted deployment.
