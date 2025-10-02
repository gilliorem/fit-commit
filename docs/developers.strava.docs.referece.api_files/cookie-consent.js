(function () {
  // Ensure global namespaces  
  window.StravaSnowplow = window.StravaSnowplow || {};

  const urlParams = new URLSearchParams(window.location.search);

  // Check if Relyance consent management is enabled via URL parameter
  // https://strava.atlassian.net/wiki/x/DIBuzQ
  const isRlyEnabled = urlParams.get('rly') === '1';

  if (isRlyEnabled) {

    // Load StravaRlyListeners -->
    // https://strava.atlassian.net/wiki/spaces/GF/pages/3446571020/Relyance+Consent+Management#window.StravaRlyListeners -->

    const stravaScript = document.createElement('script');
    stravaScript.id = 'strava-rly-listeners';
    stravaScript.src = 'https://www.strava.com/strava-rly-listeners.js';

    // onload handler
    stravaScript.onload = () => {
      if (window.StravaRlyListeners) {
        window.StravaRlyListeners.init({ 
          logError: (error, context) => StravaSentry?.logError(error, context),
          track: (e) => window.StravaSnowplow?.track(e),
          setTags: (tags) =>  StravaSentry?.setTags(tags)
        });
      } else {
        StravaSentry?.logError("StravaRlyListeners not available");
      }
    };

    // onerror handler
    stravaScript.onerror = (e) => {
      StravaSentry?.logError(e);
    };

    document.head.appendChild(stravaScript);
  }


  // Cookie utilities
  function setCookie(name, value, days) {
    var expires = "";
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
  }

  function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  function clearSnowplowCookies() {
    // Clear Snowplow cookies
    var cookies = document.cookie.split(";");
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i];
      var eqPos = cookie.indexOf("=");
      var name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();

      // Clear Snowplow-related cookies
      if (name.startsWith('_sp_') || name.startsWith('sp_')) {
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=." + window.location.hostname;
      }
    }
  }

  /**
   * Tracks events using the Snowplow analytics platform.
   * This function validates the event data and either sends it to Snowplow
   *
   * @param {Object} param0 - The event data to track.
   * @param {string} param0.page - The page where the event occurred.
   * @param {string} param0.category - The category of the event.
   * @param {string} param0.action - The action performed in the event.
   * @param {string} [param0.element=null] - The element associated with the event (must match regex ^[a-z0-9_]+$).
   * @param {Object} [param0.properties={}] - Additional properties related to the event.
   */
  function track({
    page,
    category,
    action,
    element = null,
    properties = {}
  }) {
    if (!window.snowplow) {
      return;
    }

    if (!/^[a-z0-9_]+$/.test(element)) {
      StravaSentry?.logError(new Error(
        `element: "${element}" does not match the regex pattern ^[a-z0-9_]+$`
      ));
      return;
    }

    const data = {
      page,
      category,
      action,
      element,
      properties
    };

    // https://github.com/snowplow/snowplow/wiki/2-Specific-event-tracking-with-the-Javascript-tracker#trackSelfDescribingEvent
    window.snowplow('trackSelfDescribingEvent', {
      // https://github.com/strava/snowplow-schema-registry/blob/master/schemas/com.strava/track/jsonschema/1-0-0
      schema: 'iglu:com.strava/track/jsonschema/1-0-0',
      data
    });
  }

  // Expose track function
  window.StravaSnowplow.track = track;

  function loadSnowplow() {
    if (window.snowplow){
      // snowplow already loaded and performance consent is given at this point
      // so we can enable non-anonymous tracking
      snowplow('disableAnonymousTracking');
      return;
    }

    // Load Snowplow
    (function (p, l, o, w, i, n, g) { if (!p[i]) { p.GlobalSnowplowNamespace = p.GlobalSnowplowNamespace || []; p.GlobalSnowplowNamespace.push(i); p[i] = function () { (p[i].q = p[i].q || []).push(arguments) }; p[i].q = p[i].q || []; n = l.createElement(o); g = l.getElementsByTagName(o)[0]; n.async = 1; n.src = w; g.parentNode.insertBefore(n, g) } }(window, document, "script", "https://dy9z4910shqac.cloudfront.net/1oG5icild0laCtJMi45LjA.js", "snowplow"));

    snowplow("newTracker", "cf", "c.strava.com", {
      appId: "developers",
      platform: "web"
    });
    snowplow('trackPageView');
    snowplow('enableLinkClickTracking');
  }

  function showConsentBanner() {
    var banner = document.getElementById('cookie-consent-banner');
    if (banner) {
      banner.style.display = 'block';
    }
  }

  function hideConsentBanner() {
    var banner = document.getElementById('cookie-consent-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  // Check consent status
  if (isRlyEnabled) {
    if (banner) {
      banner.style.display = 'none';
    }
  } else {
    var consent = getCookie('_strava_cbv3');
    var banner = document.getElementById('cookie-consent-banner');

    if (consent === null && banner) {
      banner.style.display = 'block';
    } else if (consent === 'true') {
      loadSnowplow();
    }
  }

  // Event handlers
  document.addEventListener('DOMContentLoaded', function () {
    var manageBtn = document.getElementById('manage-cookies-link');

    if (isRlyEnabled) {
      // Listen to Relyance consent events
      // https://strava.atlassian.net/wiki/spaces/GF/pages/3446571020/Relyance+Consent+Management#Consent-Events-and-Cookie-Cleanup
      window.addEventListener('strava:rly:consent-given:performance', () => {
        loadSnowplow();
      });

      window.addEventListener('strava:rly:consent-revoked:performance', () => {
        if (window.StravaRlyListeners) {
          window.StravaRlyListeners.cleanupSnowplow();
        } else {
          StravaSentry?.logError("StravaRlyListeners not available for cleanup");
        }
      });

      if (manageBtn) {
        manageBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (window.StravaRlyListeners) {
            StravaRlyListeners.showPreferenceCenter();
          } else {
            StravaSentry?.logError("StravaRlyListeners not available to show preference center");
          }
        });
      } else {
        StravaSentry?.logError("Manage cookies link not found");
      }
    } else {

      // Listen to strava consent banner buttons
      var acceptBtn = document.getElementById('accept-cookies');
      var rejectBtn = document.getElementById('reject-cookies');

      if (acceptBtn) {
        acceptBtn.addEventListener('click', function () {
          setCookie('_strava_cbv3', 'true', 365);
          hideConsentBanner();
          loadSnowplow();
        });
      }

      if (rejectBtn) {
        rejectBtn.addEventListener('click', function () {
          setCookie('_strava_cbv3', 'false', 365);
          hideConsentBanner();
          clearSnowplowCookies();

          if (window.snowplow) {
            window.snowplow = undefined;
            window.location.reload();
          }
        });
      }

      if (manageBtn) {
        manageBtn.addEventListener('click', function (e) {
          e.preventDefault();
          showConsentBanner();
        });
      }
    }
  });
})();
