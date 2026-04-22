(function () {
  const ENDPOINT = '/api/public/traffic';
  const SESSION_KEY = 'blaene_traffic_session_id';
  const CLICK_THROTTLE_MS = 400;
  let lastClickAt = 0;
  let knownCustomerEmail = null;

  function normalizeText(value, max = 500) {
    return String(value || '').trim().slice(0, max);
  }

  function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return '';
    return email.slice(0, 220);
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
    const enrichedPayload = {
      ...payload,
      ...geoData,
      customer_email: knownCustomerEmail || null,
    };
    const body = JSON.stringify(enrichedPayload);
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

  let geoData = { country: null, city: null };

  function readEmailFromSupabaseStorage() {
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || key.indexOf('-auth-token') === -1) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          parsed = null;
        }

        const fromSession = normalizeEmail(
          parsed &&
          parsed.currentSession &&
          parsed.currentSession.user &&
          parsed.currentSession.user.email
        );
        if (fromSession) return fromSession;

        const fromUser = normalizeEmail(
          parsed &&
          parsed.user &&
          parsed.user.email
        );
        if (fromUser) return fromUser;
      }
    } catch (_) {}
    return '';
  }

  async function refreshKnownCustomerEmail() {
    try {
      const fromStorage = normalizeEmail(readEmailFromSupabaseStorage());
      if (fromStorage) {
        knownCustomerEmail = fromStorage;
      }
      if (window.BlaeneAuth && typeof window.BlaeneAuth.getCurrentUser === 'function') {
        const currentUser = await window.BlaeneAuth.getCurrentUser();
        const fromAuth = normalizeEmail(currentUser && currentUser.email);
        if (fromAuth) knownCustomerEmail = fromAuth;
      }
    } catch (_) {}
  }

  async function fetchGeoData() {
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        geoData = {
          country: data.country_name || null,
          city: data.city || null,
        };
      }
    } catch (_) {}
  }

  const basePayload = {
    session_id: getSessionId(),
    page_url: normalizeText(window.location.href, 1000),
    page_path: normalizeText(window.location.pathname, 240) || '/',
    referrer: normalizeText(document.referrer, 1000) || null,
    ...getUtm(),
    country: null,
    city: null,
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
      track_kind: normalizeText(data.track_kind, 60) || null,
      product_code: normalizeText(data.product_code, 80) || null,
      product_name: normalizeText(data.product_name, 160) || null,
      element_tag: normalizeText(data.element_tag, 40) || null,
      element_text: normalizeText(data.element_text, 160) || null,
      element_href: normalizeText(data.element_href, 1000) || null,
    });
  }

  function extractProductCodeFromHref(href) {
    const raw = normalizeText(href, 1000);
    if (!raw) return '';
    try {
      const parsed = new URL(raw, window.location.origin);
      const code = normalizeText(parsed.searchParams.get('code'), 80).toUpperCase();
      return code || '';
    } catch (_) {
      const query = raw.split('?')[1] || '';
      const params = new URLSearchParams(query);
      return normalizeText(params.get('code'), 80).toUpperCase() || '';
    }
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

        const elementHref = target.getAttribute('href') || '';
        const productCode =
          normalizeText(target.getAttribute('data-track-product-code'), 80).toUpperCase() ||
          extractProductCodeFromHref(elementHref);
        const productName = normalizeText(target.getAttribute('data-track-product-name'), 160);

        lastClickAt = now;
        trackClick({
          track_kind: target.getAttribute('data-track') || '',
          product_code: productCode || '',
          product_name: productName || '',
          element_tag: target.tagName ? target.tagName.toLowerCase() : 'unknown',
          element_text: target.getAttribute('data-track-label') || target.textContent || '',
          element_href: elementHref,
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
      void refreshKnownCustomerEmail();
      void fetchGeoData().then(() => {
        trackPageView();
      });
      bindClickTracking();
    });
  } else {
    void refreshKnownCustomerEmail();
    void fetchGeoData().then(() => {
      trackPageView();
    });
    bindClickTracking();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      void refreshKnownCustomerEmail();
    }
  });
})();
