set -e

printf '%s' '{"username":"admin","password":"admin123"}' >/tmp/streamdesk-login.json

echo '--- LOGIN ---'
curl -i -s -c /tmp/streamdesk.cookies \
  -H 'Content-Type: application/json' \
  --data @/tmp/streamdesk-login.json \
  http://127.0.0.1:5000/api/auth/login
echo

echo '--- OVERVIEW ---'
curl -i -s -b /tmp/streamdesk.cookies http://127.0.0.1:5000/api/platform/overview
echo

echo '--- CONFIG ---'
curl -i -s -b /tmp/streamdesk.cookies http://127.0.0.1:5000/api/platform/config
echo

rm -f /tmp/streamdesk-login.json /tmp/streamdesk.cookies
