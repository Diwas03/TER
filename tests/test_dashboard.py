import http.client
from http.server import HTTPServer
import json
import threading
import unittest
from unittest.mock import patch
from decimal import Decimal
from io import BytesIO
from web.api import status
import monitor


class QuietHandler(status.handler):
    def log_message(self, *args):
        pass


class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.server = HTTPServer(('127.0.0.1', 0), QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method, data=None, token='private-test-token'):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        body = json.dumps(data) if data is not None else None
        connection.request(method, '/api/status', body, {'Authorization': 'Bearer ' + token})
        response = connection.getresponse()
        code, payload = response.status, json.load(response)
        connection.close()
        return code, payload

    @patch.dict('os.environ', {'MONITOR_API_TOKEN': 'private-test-token'})
    @patch('web.api.status.redis')
    def test_rejects_bad_auth_without_storage_access(self, store):
        self.assertEqual(self.request('GET', token='wrong')[0], 401)
        store.assert_not_called()

    @patch.dict('os.environ', {'MONITOR_API_TOKEN': 'private-test-token'})
    def test_publish_and_read(self):
        with patch('web.api.status.redis', return_value='OK') as store:
            self.assertEqual(self.request('POST', {'price': '125.9', 'threshold': '126', 'alerted': True})[0], 200)
            command = store.call_args.args[0]
            stored = json.loads(command[2])
            self.assertEqual(stored['price'], '125.9')
            self.assertIn('received_at', stored)
            self.assertEqual(command[-2:], ['EX', 86400])
        with patch('web.api.status.redis', return_value=json.dumps(stored)):
            code, body = self.request('GET')
            self.assertEqual(code, 200)
            self.assertEqual(body['status']['threshold'], '126')

    @patch.dict('os.environ', {'MONITOR_API_TOKEN': 'private-test-token'})
    @patch('web.api.status.redis')
    def test_rejects_invalid_price(self, store):
        for price in ('NaN', '-1', 'Infinity'):
            self.assertEqual(self.request('POST', {'price': price, 'threshold': '126', 'alerted': False})[0], 400)
        store.assert_not_called()

    @patch.dict('os.environ', {'DASHBOARD_URL': 'https://example.vercel.app', 'MONITOR_API_TOKEN': 'private-test-token'})
    def test_monitor_status_submission(self):
        with patch('monitor.urlopen', return_value=BytesIO(b'{"ok":true}')) as send:
            monitor.publish_status(Decimal('125.9'), Decimal('126'), {'alerted': True})
            request = send.call_args.args[0]
            self.assertEqual(request.full_url, 'https://example.vercel.app/api/status')
            self.assertEqual(json.loads(request.data)['price'], '125.9')
