"""Authenticated status relay. TER credentials never leave the Windows monitor."""
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hmac
import json
import os
from urllib.request import Request, urlopen

KEY = 'ter-monitor:status:v1'


def redis(command):
    request = Request(os.environ['UPSTASH_REDIS_REST_URL'].rstrip('/'),
                      data=json.dumps(command).encode(),
                      headers={'Authorization': 'Bearer ' + os.environ['UPSTASH_REDIS_REST_TOKEN'],
                               'Content-Type': 'application/json'})
    with urlopen(request, timeout=10) as response:
        result = json.load(response)
    if result.get('error'):
        raise RuntimeError('Status storage unavailable')
    return result.get('result')


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('Invalid status')
    result = {}
    for name in ('price', 'threshold'):
        value = str(data[name])
        if len(value) > 30:
            raise ValueError('Invalid amount')
        number = Decimal(value)
        if not number.is_finite() or number <= 0:
            raise ValueError('Invalid amount')
        result[name] = str(number)
    if type(data.get('alerted')) is not bool:
        raise ValueError('Invalid alert state')
    result['alerted'] = data['alerted']
    result['received_at'] = datetime.now(timezone.utc).isoformat()
    return result


class handler(BaseHTTPRequestHandler):
    def reply(self, code, value):
        body = json.dumps(value).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        token = os.environ.get('MONITOR_API_TOKEN', '')
        if not token:
            self.reply(503, {'error': 'Server configuration incomplete'})
            return False
        supplied = self.headers.get('Authorization', '')
        if not hmac.compare_digest(supplied.encode(), ('Bearer ' + token).encode()):
            self.reply(401, {'error': 'Access denied'})
            return False
        return True

    def do_GET(self):
        if not self.authorized():
            return
        try:
            value = redis(['GET', KEY])
            self.reply(200, {'status': json.loads(value) if value else None})
        except Exception:
            self.reply(503, {'error': 'Status storage unavailable; check Vercel settings'})

    def do_POST(self):
        if not self.authorized():
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 2048:
                raise ValueError('Invalid payload size')
            data = validate(json.loads(self.rfile.read(length)))
        except (ValueError, KeyError, TypeError, InvalidOperation):
            self.reply(400, {'error': 'Invalid status payload'})
            return
        try:
            redis(['SET', KEY, json.dumps(data), 'EX', 86400])
            self.reply(200, {'ok': True})
        except Exception:
            self.reply(503, {'error': 'Status storage unavailable'})
