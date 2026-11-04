export function supportedEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
      (url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' ||
       url.hostname.endsWith('.push.services.mozilla.com') || url.hostname === 'web.push.apple.com' ||
       url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}

