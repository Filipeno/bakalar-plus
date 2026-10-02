# Gateway for schools that block Cloudflare

Some schools' firewalls drop traffic from Cloudflare, so the Worker can't reach them (the request just times
out). `gateway.py` runs on a machine with an ordinary Czech internet connection and makes those requests for the
Worker. The Worker tries every school directly first and only uses the gateway for schools that don't answer
(remembered for a day).

- Listens on `127.0.0.1` only. The Worker reaches it privately through a Cloudflare Tunnel (a Workers VPC
  service), so it has no public address.
- Requires the shared secret in `X-BP-Gateway`, only forwards `https` requests to Bakaláři paths
  (`/api…`, `/Timetable/Public…`) and school-canteen (iCanteen) pages, stores nothing and doesn't log URLs.
  Cookies pass through for the canteen login but aren't kept.
- Python standard library only (works on a 32-bit Raspberry Pi).

## Setup (Linux with systemd and cloudflared already running a tunnel)

```
sudo install -d /opt/bp-gateway
sudo install -m 644 gateway.py /opt/bp-gateway/
sudo install -m 644 bp-gateway.service /etc/systemd/system/
echo "BP_GATEWAY_SECRET=$(python3 -c 'import secrets;print(secrets.token_urlsafe(40))')" | sudo tee /etc/bp-gateway.env >/dev/null
sudo chmod 600 /etc/bp-gateway.env
sudo systemctl daemon-reload && sudo systemctl enable --now bp-gateway
```

Then, from `worker/`:

```
npx wrangler vpc service create bp-gateway --type http --tunnel-id <your tunnel id> --ipv4 127.0.0.1 --http-port 8770
# put the printed service id into wrangler.toml ([[vpc_services]] GATEWAY)
npx wrangler secret put GATEWAY_SECRET       # the same value as in /etc/bp-gateway.env
npm run deploy
```

Check: `curl -H "X-BP-Gateway: <secret>" http://127.0.0.1:8770/health` on the machine prints `ok`.
The service runs as a throwaway systemd user (`DynamicUser`) with no access to the rest of the machine.
