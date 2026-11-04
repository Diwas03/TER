import json
import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
import monitor


class HistoryTests(unittest.TestCase):
    @patch.dict('os.environ', {}, clear=True)
    @patch('monitor.urlopen')
    def test_history_is_optional(self, send):
        monitor.publish_history(Decimal('125.5'), '2026-11-04T12:00:00+00:00')
        send.assert_not_called()

    @patch.dict('os.environ', {'SUPABASE_URL': 'https://test-project.supabase.co',
                               'SUPABASE_SERVICE_ROLE_KEY': 'private-test-key'}, clear=True)
    def test_history_payload_contains_only_price_and_observation_time(self):
        response = MagicMock()
        response.__enter__.return_value = SimpleNamespace(status=201)
        with patch('monitor.urlopen', return_value=response) as send:
            monitor.publish_history(Decimal('125.5'), '2026-11-04T12:00:00+00:00')
        request = send.call_args.args[0]
        self.assertEqual(request.full_url, 'https://test-project.supabase.co/rest/v1/price_observations')
        self.assertEqual(json.loads(request.data), {'price': '125.5', 'observed_at': '2026-11-04T12:00:00+00:00'})
        self.assertEqual(request.get_method(), 'POST')

    @patch.dict('os.environ', {'SUPABASE_URL': 'http://untrusted.example',
                               'SUPABASE_SERVICE_ROLE_KEY': 'private-test-key'}, clear=True)
    @patch('monitor.urlopen')
    def test_rejects_untrusted_destination_before_sending_key(self, send):
        with self.assertRaises(ValueError):
            monitor.publish_history(Decimal('125'), '2026-11-04T12:00:00+00:00')
        send.assert_not_called()

    @patch.dict('os.environ', {'TER_PRICE_SELECTOR': '#buy', 'TER_RUNTIME_DIR': '/tmp/ter-history-test',
                               'SUPABASE_URL': 'https://test-project.supabase.co'}, clear=True)
    def test_collection_only_records_without_sending_alerts(self):
        page = MagicMock()
        page.goto.return_value = SimpleNamespace(status=200, ok=True)
        page.locator.return_value.count.return_value = 1
        page.locator.return_value.text_content.return_value = 'Nu. 125.5'
        browser = MagicMock()
        browser.pages = [page]
        playwright = MagicMock()
        playwright.chromium.launch_persistent_context.return_value = browser
        context = MagicMock()
        context.__enter__.return_value = playwright
        with patch('sys.argv', ['monitor.py', '--source', 'browser', '--once', '--no-alerts']), \
             patch('playwright.sync_api.sync_playwright', return_value=context), \
             patch('monitor.publish_history') as history, \
             patch('monitor.send_whatsapp') as alert, \
             patch('monitor.save_state') as save:
            monitor.main()
        history.assert_called_once()
        self.assertEqual(history.call_args.args[0], Decimal('125.5'))
        alert.assert_not_called()
        save.assert_not_called()
        browser.close.assert_called_once()
