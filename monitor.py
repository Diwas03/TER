"""Read an explicitly selected TER buy-price field and alert through Twilio."""
import argparse
import base64
import json
import logging
import os
from pathlib import Path
import re
import time
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode
from urllib.request import Request, urlopen

URL = 'https://ter.bt/portal/dashboard/trade/buy'
LOG = logging.getLogger('ter-monitor')


def parse_price(text):
    # Require one unambiguous amount; reject bid/ask lists and malformed grouping.
    cleaned = re.sub(r'\b(?:BTN|TER)\b|\bNu\.?', '', text, flags=re.I).strip()
    if not re.fullmatch(r'(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?', cleaned):
        raise ValueError('Price field must contain exactly one positive numeric amount')
    value = Decimal(cleaned.replace(',', ''))
    if value <= 0:
        raise ValueError('Price must be positive')
    return value


def required(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise ValueError(f'Missing {name}; configure it securely before running')
    return value


def send_whatsapp(price, threshold):
    sid = required('TWILIO_ACCOUNT_SID')
    token = required('TWILIO_AUTH_TOKEN')
    sender = required('TWILIO_WHATSAPP_FROM')
    recipient = required('TWILIO_WHATSAPP_TO')
    if not re.fullmatch(r'AC[0-9a-fA-F]{32}', sid):
        raise ValueError('Invalid Twilio account SID')
    for number in (sender, recipient):
        if not re.fullmatch(r'whatsapp:\+[1-9]\d{6,14}', number):
            raise ValueError('WhatsApp numbers must use whatsapp:+ followed by E.164 digits')
    fields = {'From': sender, 'To': recipient}
    template = os.environ.get('TWILIO_CONTENT_SID')
    if template:
        fields.update(ContentSid=template, ContentVariables=json.dumps({'1': str(price), '2': str(threshold)}))
    else:
        fields['Body'] = f'TER buy price is {price}, below your target {threshold}. Check {URL}'
    auth = base64.b64encode(f'{sid}:{token}'.encode()).decode()
    request = Request(f'https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json',
                      data=urlencode(fields).encode(),
                      headers={'Authorization': f'Basic {auth}'}, method='POST')
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    if not result.get('sid') or result.get('status') not in ('accepted', 'queued', 'sending', 'sent', 'delivered', 'read'):
        raise RuntimeError('Twilio did not accept the WhatsApp message')
    return result['sid']


def load_state(path):
    if not path.exists():
        return {'alerted': False}
    state = json.loads(path.read_text())
    if not isinstance(state, dict) or type(state.get('alerted')) is not bool:
        raise ValueError('Invalid alert state; inspect it before restarting')
    return state


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(state))
    os.chmod(temp, 0o600)
    temp.replace(path)


def process_price(price, threshold, state, deliver):
    """Send once below target, rearm only after a successful reading above it."""
    if price >= threshold:
        return {'alerted': False}
    if state['alerted']:
        return state
    message_id = deliver(price, threshold)
    return {'alerted': True, 'message_id': message_id, 'price': str(price)}


def publish_status(price, threshold, state):
    endpoint = os.environ.get('DASHBOARD_URL', '').rstrip('/')
    if not endpoint:
        return
    if not endpoint.startswith('https://'):
        raise ValueError('DASHBOARD_URL must use HTTPS')
    request = Request(endpoint + '/api/status',
                      data=json.dumps({'price': str(price), 'threshold': str(threshold),
                                       'alerted': state['alerted']}).encode(),
                      headers={'Authorization': 'Bearer ' + required('MONITOR_API_TOKEN'),
                               'Content-Type': 'application/json'}, method='POST')
    with urlopen(request, timeout=10) as response:
        if not json.load(response).get('ok'):
            raise RuntimeError('Dashboard update rejected')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', help='Read once and exit')
    parser.add_argument('--dry-run', action='store_true', help='Read price without sending or changing state')
    parser.add_argument('--visible', action='store_true', help='Keep the monitor browser visible')
    parser.add_argument('--login', action='store_true', help='Open a visible browser for manual login; requires a desktop')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    threshold = Decimal(os.environ.get('TER_THRESHOLD', '126'))
    interval = float(os.environ.get('TER_INTERVAL_SECONDS', '15'))
    if not threshold.is_finite() or threshold <= 0 or not 15 <= interval <= 86400:
        parser.error('Use a positive threshold and polling interval between 15 and 86400 seconds')
    if os.name != 'nt':
        os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.cache/ms-playwright')
    runtime = Path(os.environ.get('TER_RUNTIME_DIR', '.runtime'))
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    state_path = runtime / 'state.json'
    selector = '' if args.login else required('TER_PRICE_SELECTOR')
    if not args.dry_run and not args.login:
        for name in ('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_TO'):
            required(name)
    from playwright.sync_api import sync_playwright
    # One process per profile: Chromium also locks persistent profiles.
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(str(runtime / 'browser'), headless=not (args.login or args.visible))
        page = browser.pages[0] if browser.pages else browser.new_page()
        try:
            if args.login:
                page.goto(URL, wait_until='domcontentloaded', timeout=60000)
                input('Complete login manually, then press Enter here to save the session: ')
                return
            while True:
                try:
                    response = page.goto(URL, wait_until='domcontentloaded', timeout=60000)
                    if response is None or not response.ok:
                        raise RuntimeError('TER page request failed')
                    field = page.locator(selector)
                    field.wait_for(state='visible', timeout=30000)
                    if field.count() != 1:
                        raise ValueError('TER_PRICE_SELECTOR must identify exactly one buy-price field')
                    price = parse_price(field.inner_text(timeout=10000))
                    LOG.info('Observed TER buy price: %s; target: %s', price, threshold)
                    if not args.dry_run:
                        state = process_price(price, threshold, load_state(state_path), send_whatsapp)
                        save_state(state_path, state)
                        try:
                            publish_status(price, threshold, state)
                        except Exception as exc:
                            LOG.warning('Dashboard update failed (%s); monitoring continues', type(exc).__name__)
                except Exception as exc:
                    # Never log request headers, credential values, or remote response bodies.
                    LOG.error('Check failed (%s); no successful alert recorded', type(exc).__name__)
                    if args.once:
                        raise SystemExit(1) from None
                if args.once:
                    break
                time.sleep(interval)
        finally:
            browser.close()


if __name__ == '__main__':
    main()
