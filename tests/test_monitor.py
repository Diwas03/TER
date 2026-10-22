import json
from decimal import Decimal
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
import monitor


class MonitorTests(unittest.TestCase):
    def test_parse_price(self):
        for text, expected in [('125', '125'), ('BTN 124.50', '124.50'), ('Nu. 125', '125'), ('1,250.00', '1250.00')]:
            self.assertEqual(monitor.parse_price(text), Decimal(expected))
        for text in ['0', '-125', 'NaN', 'Buy 125 Sell 126', '1,25', '', 'Login', '125 126']:
            with self.assertRaises(ValueError):
                monitor.parse_price(text)

    def test_crossing_and_rearm(self):
        sent = []
        def deliver(price, target):
            sent.append(price)
            return 'SMexample'
        state = {'alerted': False}
        for price in ['126', '125', '124', '126', '123']:
            state = monitor.process_price(Decimal(price), Decimal('126'), state, deliver)
        self.assertEqual(sent, [Decimal('125'), Decimal('123')])

    def test_equal_threshold_does_not_alert(self):
        def fail(*args):
            self.fail('Equal threshold must not notify')
        self.assertEqual(monitor.process_price(Decimal('126'), Decimal('126'), {'alerted': False}, fail), {'alerted': False})

    def test_failed_delivery_does_not_mark_alerted(self):
        state = {'alerted': False}
        def fail(*args):
            raise RuntimeError('network failure')
        with self.assertRaises(RuntimeError):
            monitor.process_price(Decimal('124'), Decimal('125'), state, fail)
        self.assertEqual(state, {'alerted': False})

    def test_persistence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'state.json'
            self.assertEqual(monitor.load_state(path), {'alerted': False})
            monitor.save_state(path, {'alerted': True})
            self.assertEqual(monitor.load_state(path), {'alerted': True})
            path.write_text('{"alerted": "false"}')
            with self.assertRaises(ValueError):
                monitor.load_state(path)

    @patch.dict('os.environ', {'TWILIO_ACCOUNT_SID': 'AC' + 'a'*32, 'TWILIO_AUTH_TOKEN': 'test',
                             'TWILIO_WHATSAPP_FROM': 'whatsapp:+12345678901',
                             'TWILIO_WHATSAPP_TO': 'whatsapp:+12345678902'}, clear=True)
    def test_twilio_request(self):
        from io import BytesIO
        with patch('monitor.urlopen', return_value=BytesIO(json.dumps({'sid': 'SMtest', 'status': 'queued'}).encode())) as send:
            self.assertEqual(monitor.send_whatsapp(Decimal('125'), Decimal('125')), 'SMtest')
            request = send.call_args.args[0]
            self.assertIn(b'TER+buy+price+is+125', request.data)
            self.assertEqual(request.get_method(), 'POST')
            self.assertTrue(request.full_url.startswith('https://api.twilio.com/'))


if __name__ == '__main__':
    unittest.main()
