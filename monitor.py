"""Collect TER buy prices from its public API, with optional browser fallback."""
import argparse
import base64
import json
import logging
import os
from pathlib import Path
import re
import time
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

URL = os.environ.get('TER_URL', 'https://ter.bt/portal/dashboard/trade/buy')
LOG = logging.getLogger('ter-monitor')


class PageCheckError(RuntimeError):
    """Only controlled diagnostic messages belong in this exception."""


def check_page_response(response):
    if response is None:
        raise PageCheckError('TER navigation returned no HTTP response. Verify TER_URL.')
    status = int(response.status)
    LOG.info('TER page response: HTTP %d', status)
    if response.ok:
        return
    hints = {
        401: 'TER requires authentication. Renew the private login session and test again.',
        403: 'TER refused this request. Verify TER_URL and session validity; the site may restrict cloud runners. This status alone does not identify the cause.',
        404: 'The saved TER_URL was not found. Copy the exact address of the live price page.',
        429: 'TER is rate-limiting requests. Pause scheduled runs and retry later.',
    }
    hint = hints.get(status, 'The TER page could not be loaded. Verify TER_URL and try later if the site is unavailable.')
    raise PageCheckError(f'TER returned HTTP {status}. {hint}')


def log_check_failure(exc):
    if isinstance(exc, PageCheckError):
        LOG.error('Check failed: %s No alert sent.', exc)
    elif type(exc).__name__ == 'TimeoutError':
        LOG.error('Check timed out. Check TER availability, login expiry, and TER_PRICE_SELECTOR. No alert sent.')
    else:
        # Other exception messages can contain private URLs or request details.
        LOG.error('Check failed (%s); no successful alert recorded', type(exc).__name__)


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


def publish_history(price, observed_at):
    """Write only public price data; the privileged key stays on the worker."""
    endpoint = os.environ.get('SUPABASE_URL', '').rstrip('/')
    if not endpoint:
        return
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', endpoint):
        raise ValueError('SUPABASE_URL must be a hosted Supabase HTTPS project URL')
    key = required('SUPABASE_SERVICE_ROLE_KEY')
    request = Request(endpoint + '/rest/v1/price_observations',
        data=json.dumps({'price': str(price), 'observed_at': observed_at}).encode(),
        headers={'apikey': key, 'Authorization': 'Bearer ' + key,
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}, method='POST')
    with urlopen(request, timeout=15) as response:
        if response.status != 201:
            raise RuntimeError('Price history write rejected')


def parse_api_quote(payload, now=None):
    now = now or datetime.now(timezone.utc)
    quotes = payload.get('prices') if isinstance(payload, dict) else None
    if not isinstance(quotes, list):
        raise ValueError('Missing price list')
    matches = [q for q in quotes if isinstance(q, dict) and q.get('product_symbol') == 'TERBTN']
    if len(matches) != 1:
        raise ValueError('Expected exactly one TERBTN quote')
    quote = matches[0]
    raw = quote.get('ask_price')
    if type(raw) is not int or raw <= 0 or quote.get('tradeable') is not True:
        raise ValueError('Invalid or non-tradeable TERBTN ask')
    stamp = quote.get('effective_at')
    if not isinstance(stamp, str):
        raise ValueError('Missing quote timestamp')
    effective = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
    if effective.tzinfo is None or not -10 <= (now - effective).total_seconds() <= 60:
        raise ValueError('Stale or future TER quote')
    return Decimal(raw) / Decimal(10000), effective.astimezone(timezone.utc).isoformat()


def fetch_api_quote():
    # No login cookies, tokens, CSRF headers or browser session are used.
    request = Request('https://api.ter.bt/prices', headers={'Accept': 'application/json'})
    with urlopen(request, timeout=10) as response:
        if response.status != 200:
            raise RuntimeError('TER price API unavailable')
        return parse_api_quote(json.load(response))


def run_api(args, threshold, interval, state_path):
    while True:
        started = time.monotonic()
        try:
            price, observed_at = fetch_api_quote()
            LOG.info('Observed TERBTN API buy price: %s; effective at: %s', price, observed_at)
            if not args.dry_run:
                # Persist the source timestamp, never relabel an old quote as current.
                try:
                    publish_history(price, observed_at)
                except Exception as exc:
                    LOG.warning('History write failed (%s); observation not stored', type(exc).__name__)
                    if args.once:
                        raise
                state = load_state(state_path)
                if not args.no_alerts:
                    state = process_price(price, threshold, state, send_whatsapp)
                    save_state(state_path, state)
                try:
                    publish_status(price, threshold, state)
                except Exception as exc:
                    LOG.warning('Dashboard update failed (%s)', type(exc).__name__)
        except Exception as exc:
            LOG.error('API collection failed (%s); no fresh reading recorded', type(exc).__name__)
            if args.once:
                raise SystemExit(1) from None
        if args.once:
            return
        # One request per interval; slow checks never cause catch-up bursts.
        time.sleep(max(0, interval - (time.monotonic() - started)))


def session_init_script(session_storage):
    # JSON encoding prevents session values from becoming executable JavaScript.
    payload = json.dumps(session_storage)
    return "const saved = " + payload + "; const values = saved[location.origin]; if(values) for(const [key,value] of Object.entries(values)) sessionStorage.setItem(key,value);"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', choices=('api', 'browser'), default='api', help='Public API by default; browser is a legacy fallback')
    parser.add_argument('--no-alerts', action='store_true', help='Collect prices without WhatsApp alerts')
    parser.add_argument('--once', action='store_true', help='Read once and exit')
    parser.add_argument('--dry-run', action='store_true', help='Read price without sending or changing state')
    parser.add_argument('--export-session', action='store_true', help='Export a logged-in session for a private cloud worker')
    parser.add_argument('--visible', action='store_true', help='Keep the monitor browser visible')
    parser.add_argument('--login', action='store_true', help='Open a visible browser for manual login; requires a desktop')
    args = parser.parse_args()
    if args.export_session:
        args.login = True
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
    if not args.dry_run and not args.login and not args.no_alerts:
        for name in ('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_TO'):
            required(name)
    if args.source == 'api' and not args.login:
        run_api(args, threshold, interval, state_path)
        return
    selector = '' if args.login else required('TER_PRICE_SELECTOR')
    from playwright.sync_api import sync_playwright
    # One process per profile: Chromium also locks persistent profiles.
    with sync_playwright() as p:
        engine = None
        session_json = os.environ.get('TER_BROWSER_SESSION_JSON')
        if session_json and not args.login:
            session = json.loads(session_json)
            engine = p.chromium.launch(headless=not args.visible)
            browser = engine.new_context(storage_state=session['storage'])
            browser.add_init_script(script=session_init_script(session.get('session_storage', {})))
        else:
            browser = p.chromium.launch_persistent_context(str(runtime / 'browser'), headless=not (args.login or args.visible))
        page = browser.pages[0] if browser.pages else browser.new_page()
        try:
            if args.login:
                page.goto(URL, wait_until='domcontentloaded', timeout=60000)
                input('Complete login manually, then press Enter here to save the session: ')
                if args.export_session:
                    session = {'storage': browser.storage_state(), 'session_storage': {}}
                    for tab in browser.pages:
                        if tab.url.startswith('https://ter.bt/'):
                            session['session_storage']['https://ter.bt'] = tab.evaluate('Object.assign({}, sessionStorage)')
                    output = runtime / 'cloud-session.json'
                    output.write_text(json.dumps(session))
                    os.chmod(output, 0o600)
                    LOG.info('Private session saved to %s. Treat it like your password; never commit or share it.', output)
                return
            while True:
                try:
                    response = page.goto(URL, wait_until='domcontentloaded', timeout=60000)
                    check_page_response(response)
                    field = page.locator(selector)
                    field.wait_for(state='visible', timeout=30000)
                    if field.count() != 1:
                        raise ValueError('TER_PRICE_SELECTOR must identify exactly one buy-price field')
                    price = parse_price(field.text_content(timeout=10000) or '')
                    LOG.info('Observed TER buy price: %s; target: %s', price, threshold)
                    if not args.dry_run:
                        observed_at = datetime.now(timezone.utc).isoformat()
                        try:
                            publish_history(price, observed_at)
                        except Exception as exc:
                            LOG.warning('History write failed (%s); observation not stored', type(exc).__name__)
                            if args.once:
                                raise
                        if args.no_alerts:
                            state = load_state(state_path)
                        else:
                            state = process_price(price, threshold, load_state(state_path), send_whatsapp)
                            save_state(state_path, state)
                        try:
                            publish_status(price, threshold, state)
                        except Exception as exc:
                            LOG.warning('Dashboard update failed (%s); monitoring continues', type(exc).__name__)
                except Exception as exc:
                    # Never log request headers, credential values, or remote response bodies.
                    log_check_failure(exc)
                    if args.once:
                        raise SystemExit(1) from None
                if args.once:
                    break
                time.sleep(interval)
        finally:
            browser.close()
            if engine is not None:
                engine.close()


if __name__ == '__main__':
    main()
