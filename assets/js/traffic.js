(function () {
  const ENDPOINT = '/api/public/traffic';
  const SESSION_KEY = 'blaene_traffic_session_id';
  const CLICK_THROTTLE_MS = 400;
  let lastClickAt = 0;

  function normalizeText(value, max = 500) {
    return String(value || '').trim().slice(0, max);
  }

  function getSessionId() {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  }

  function getUtm() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: normalizeText(params.get('utm_source'), 120) || null,
      utm_medium: normalizeText(params.get('utm_medium'), 120) || null,
      utm_campaign: normalizeText(params.get('utm_campaign'), 180) || null,
      utm_term: normalizeText(params.get('utm_term'), 180) || null,
      utm_content: normalizeText(params.get('utm_content'), 180) || null,
    };
  }

  function sendEvent(payload) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  const basePayload = {
    session_id: getSessionId(),
    page_url: normalizeText(window.location.href, 1000),
    page_path: normalizeText(window.location.pathname, 240) || '/',
    referrer: normalizeText(document.referrer, 1000) || null,
    ...getUtm(),
  };

  function trackPageView() {
    sendEvent({
      event_type: 'page_view',
      ...basePayload,
    });
  }

  function trackClick(data) {
    sendEvent({
      event_type: 'click',
      ...basePayload,
      element_tag: normalizeText(data.element_tag, 40) || null,
      element_text: normalizeText(data.element_text, 160) || null,
      element_href: normalizeText(data.element_href, 1000) || null,
    });
  }

  function bindClickTracking() {
    document.addEventListener(
      'click',
      function (event) {
        const now = Date.now();
        if (now - lastClickAt < CLICK_THROTTLE_MS) return;

        const target = event.target && event.target.closest
          ? event.target.closest('a,button,[data-track]')
          : null;
        if (!target) return;

        lastClickAt = now;
        trackClick({
          element_tag: target.tagName ? target.tagName.toLowerCase() : 'unknown',
          element_text: target.getAttribute('data-track-label') || target.textContent || '',
          element_href: target.getAttribute('href') || '',
        });
      },
      true
    );
  }

  window.BlaeneTraffic = {
    trackClick,
    trackPageView,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      trackPageView();
      bindClickTracking();
    });
  } else {
    trackPageView();
    bindClickTracking();
  }
})();
