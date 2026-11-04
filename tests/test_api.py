import unittest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace
import monitor

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.quote = {'product_symbol': 'TERBTN', 'ask_price': 1246671,
                      'bid_price': 1215811, 'tradeable': True, 'effective_at': self.now.isoformat()}

    def test_uses_btn_ask_and_four_decimal_scale(self):
        payload = {'prices': [dict(self.quote, product_symbol='TERUSD', ask_price=13100), self.quote]}
        price, stamp = monitor.parse_api_quote(payload, self.now)
        self.assertEqual(price, Decimal('124.6671'))
        self.assertEqual(stamp, self.now.isoformat())

    def test_rejects_bad_quotes(self):
        for change in ({'ask_price': True}, {'ask_price': 0}, {'ask_price': '1246671'},
                       {'ask_price': 1246671.0}, {'tradeable': False},
                       {'effective_at': (self.now-timedelta(seconds=61)).isoformat()},
                       {'effective_at': (self.now+timedelta(seconds=11)).isoformat()},
                       {'effective_at': '2026-11-04T12:00:00'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                monitor.parse_api_quote({'prices': [dict(self.quote, **change)]}, self.now)
        for quotes in ([], [self.quote, self.quote]):
            with self.assertRaises(ValueError):
                monitor.parse_api_quote({'prices': quotes}, self.now)

    def test_dry_run_never_writes_or_sends(self):
        args = SimpleNamespace(dry_run=True, once=True, no_alerts=False)
        with patch('monitor.fetch_api_quote', return_value=(Decimal('124.6671'), self.now.isoformat())), \
             patch('monitor.publish_history') as history, patch('monitor.send_whatsapp') as send:
            monitor.run_api(args, Decimal(126), 15, Path('/tmp/unused-state.json'))
        history.assert_not_called()
        send.assert_not_called()

    def test_api_collection_needs_no_selector_or_browser(self):
        with patch.dict('os.environ', {'TER_RUNTIME_DIR': '/tmp/ter-api-test'}, clear=True), \
             patch('sys.argv', ['monitor.py', '--once', '--no-alerts']), \
             patch('monitor.fetch_api_quote', return_value=(Decimal('124.6671'), self.now.isoformat())), \
             patch('monitor.publish_history') as history, patch('monitor.send_whatsapp') as send:
            monitor.main()
        history.assert_called_once_with(Decimal('124.6671'), self.now.isoformat())
        send.assert_not_called()
