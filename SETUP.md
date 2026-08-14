# Fresh Ubuntu setup guide

This walks through everything needed on a **brand-new Ubuntu server with nothing installed yet** - system
packages, Node.js, the app itself, your wildcard SSL certificate, and running it as a real service. Commands
assume Ubuntu 22.04 or 24.04 LTS and that you're logged in as a user with `sudo` rights.

If you just want to try the app out on your own laptop first (recommended before touching the real server),
skip to "Option B: quick local test" near the bottom.

---

## 1. Update the system and install base packages

None of the following is preinstalled on a minimal/fresh Ubuntu image - install all of it:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ca-certificates gnupg nginx ufw
```

What each package is for: `curl`/`gnupg`/`ca-certificates` are needed to add Node's package repository below,
`build-essential` provides a C compiler (some npm packages compile small native pieces during install),
`git` is used to pull down/manage this repo, `nginx` is the reverse proxy that will terminate HTTPS with your
wildcard certificate, and `ufw` is Ubuntu's firewall tool.

## 2. Install Node.js

This app is not preinstalled with Node - add NodeSource's repository and install Node 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x.x
npm -v    # should print 10.x.x
```

## 3. Create a dedicated service account

Running the app as its own unprivileged user (instead of root or your personal login) is good practice:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin complianceapp
```

## 4. Get the code onto the server

If this repo already lives in your git remote, clone it. Otherwise copy the project folder you received onto
the server (e.g. with `scp` or `rsync`) into `/opt/compliance-app`.

```bash
sudo mkdir -p /opt/compliance-app
sudo chown $USER:$USER /opt/compliance-app
git clone <your-repo-url> /opt/compliance-app
# --- or, if you copied the folder some other way, just make sure its
#     contents end up directly inside /opt/compliance-app ---
```

Git refuses to operate on a repo it doesn't think you own (a "dubious ownership" safety check), which will bite
you later once this folder is owned by the `complianceapp` service account instead of your login. Head that
off now, once, system-wide, so it never matters which user runs `git` here later:

```bash
sudo git config --system --add safe.directory /opt/compliance-app
```

## 5. Install dependencies and build

Nothing is pre-installed here either - `npm install` downloads every package this app needs from scratch:

```bash
cd /opt/compliance-app
npm install --workspaces
npm run build
```

`npm run build` compiles the TypeScript server and produces the production React bundle
(`client/dist`), which the server serves directly.

## 6. Configure environment variables

```bash
cp server/.env.example server/.env
nano server/.env    # or your editor of choice
```

Fill in, at minimum: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_DOMAIN`, `SESSION_SECRET` (generate
one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), and set
`APP_BASE_URL` to your real HTTPS hostname (e.g. `https://compliance.yourdistrict.example.org` - **no port
number**, and it must be `https://`, not `http://` - see "Troubleshooting" below for why) and
`COOKIE_SECURE=true` once you're running behind HTTPS. See the main [README.md](./README.md) for how to obtain
the Google OAuth client ID/secret.

Then hand the whole app folder to the service account you created:

```bash
sudo chown -R complianceapp:complianceapp /opt/compliance-app
sudo chmod 600 /opt/compliance-app/server/.env
```

## 7. Installing your wildcard SSL certificate

Put your existing wildcard certificate files somewhere nginx can read but that's still locked down:

```bash
sudo mkdir -p /etc/ssl/private/wildcard-cert
sudo cp /path/to/your/fullchain.pem /etc/ssl/private/wildcard-cert/fullchain.pem
sudo cp /path/to/your/privkey.pem   /etc/ssl/private/wildcard-cert/privkey.pem
sudo chmod 700 /etc/ssl/private/wildcard-cert
sudo chmod 600 /etc/ssl/private/wildcard-cert/privkey.pem
sudo chmod 644 /etc/ssl/private/wildcard-cert/fullchain.pem
sudo chown -R root:root /etc/ssl/private/wildcard-cert
```

Notes:
- If your certificate authority gave you separate `cert.pem` and `chain.pem`/intermediate files instead of a
  single `fullchain.pem`, concatenate them yourself: `cat cert.pem intermediate.pem > fullchain.pem` (server
  certificate first, then the intermediate(s)).
- If your certificate is currently in `.pfx`/`.p12` format (common if it came from a Windows CA), convert it
  first:
  ```bash
  openssl pkcs12 -in yourcert.pfx -clcerts -nokeys -out fullchain.pem
  openssl pkcs12 -in yourcert.pfx -nocerts -nodes -out privkey.pem
  ```
- These paths match `deploy/nginx.conf.example` exactly - if you use different paths, update that file to match.

## 8. Configure nginx

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/compliance-app
sudo nano /etc/nginx/sites-available/compliance-app   # set your real server_name
sudo ln -s /etc/nginx/sites-available/compliance-app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Open the firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 10. Run the app as a systemd service

```bash
sudo cp deploy/compliance-app.service /etc/systemd/system/compliance-app.service
sudo systemctl daemon-reload
sudo systemctl enable --now compliance-app
sudo systemctl status compliance-app
```

If it's not running, check logs with `sudo journalctl -u compliance-app -f`.

At this point, visiting `https://<your-hostname>` should show the sign-in page. Make sure the OAuth redirect
URI you registered in Google Cloud Console (see README.md) is exactly
`https://<your-hostname>/auth/google/callback`.

## 11. Updating the app later

```bash
cd /opt/compliance-app
sudo -u complianceapp git pull
sudo -u complianceapp npm install --workspaces
sudo -u complianceapp npm run build
sudo systemctl restart compliance-app
```

If any of those commands were ever run as a different user (your own login via plain `sudo`, or as `root`)
instead of via `sudo -u complianceapp`, ownership of some files drifts away from `complianceapp` and both
`git pull` and `npm install`/`npm run build` will start failing with permission errors. See "Fixing a broken
ownership state" in Troubleshooting below if that happens - it's a one-command fix.

---

## Troubleshooting

### `Error 400: redirect_uri_mismatch` when signing in

Google requires the redirect URI to match **exactly** what's registered in Google Cloud Console - same scheme,
host, port, and path. There's also a hard Google policy behind this that trips people up specifically on a
fresh server: **Google only allows `http://` redirect URIs for `localhost`/`127.0.0.1`. Every other hostname
must use `https://`.** So if you test by hitting the app directly on its real hostname over plain HTTP (for
example `http://your-server-hostname:3000/auth/google/callback`, before nginx/TLS is wired up), Google will
never accept that redirect URI - it's not just unregistered, it's disallowed outright.

Two ways to fix it:

- **Finish the HTTPS setup first** (steps 7-9 above), then use `https://<your-real-hostname>/auth/google/callback`
  (no port - nginx listens on the standard 443) both in `server/.env` (`APP_BASE_URL`) and as the Authorized
  redirect URI in Google Cloud Console. This is the right long-term setup anyway.
- **To test sooner, before TLS is set up**, tunnel the port to your own machine instead of hitting the
  server's hostname directly: `ssh -L 3000:localhost:3000 you@your-server`, then browse to
  `http://localhost:3000` on your own machine. `localhost` is exempt from the HTTPS requirement, so
  `http://localhost:3000/auth/google/callback` can be added as an additional Authorized redirect URI in Google
  Cloud Console (you can list more than one) purely for this kind of early testing.

### `fatal: detected dubious ownership in repository` / `npm error code EACCES` when updating

This means the repo folder ended up owned by more than one user - usually because a command got run as your
own login (via `sudo <cmd>`) or as `root` at some point instead of via `sudo -u complianceapp <cmd>`. Two
things need to both be true for updates to work: the whole folder needs to be owned by `complianceapp`, and
git needs to trust that ownership.

```bash
sudo git config --system --add safe.directory /opt/compliance-app   # only needed once, if step 4 was skipped
sudo chown -R complianceapp:complianceapp /opt/compliance-app
sudo -u complianceapp git pull
sudo -u complianceapp npm install --workspaces
sudo -u complianceapp npm run build
sudo systemctl restart compliance-app
```

Running `git config --global --add safe.directory` as your own login (or via plain `sudo`, which acts as
`root`) does **not** fix this for the `complianceapp` user - each user's `--global` git config is separate.
Either use `--system` (applies to every user, as above) or run the `--global` version as `complianceapp`
specifically: `sudo -u complianceapp git config --global --add safe.directory /opt/compliance-app`.

---

## Option B: quick local test (no server, no SSL, no nginx)

Useful for trying the app out on your own Windows/Mac/Linux machine before deploying it for real. Requires
Node.js 20+ installed locally (on Windows, install from https://nodejs.org).

```bash
npm install --workspaces
cp server/.env.example server/.env
# edit server/.env: set APP_BASE_URL=http://localhost:3000, COOKIE_SECURE=false,
# and fill in GOOGLE_CLIENT_ID/SECRET/ALLOWED_DOMAIN/SESSION_SECRET

# terminal 1
npm run dev:server

# terminal 2
npm run dev:client
```

Then open http://localhost:5173 (the Vite dev server proxies API calls to the Express server on :3000). Your
Google Cloud OAuth client needs `http://localhost:3000/auth/google/callback` added as an authorized redirect
URI for this to work (see README.md).
