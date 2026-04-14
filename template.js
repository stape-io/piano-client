const claimRequest = require('claimRequest');
const generateRandom = require('generateRandom');
const getCookieValues = require('getCookieValues');
const getRemoteAddress = require('getRemoteAddress');
const getRequestBody = require('getRequestBody');
const getRequestHeader = require('getRequestHeader');
const getRequestMethod = require('getRequestMethod');
const getRequestPath = require('getRequestPath');
const getRequestQueryParameter = require('getRequestQueryParameter');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const Object = require('Object');
const parseUrl = require('parseUrl');
const returnResponse = require('returnResponse');
const runContainer = require('runContainer');
const sendHttpGet = require('sendHttpGet');
const setCookie = require('setCookie');
const setPixelResponse = require('setPixelResponse');
const setResponseBody = require('setResponseBody');
const setResponseHeader = require('setResponseHeader');
const setResponseStatus = require('setResponseStatus');
const templateDataStorage = require('templateDataStorage');

/*==============================================================================
==============================================================================*/

const clientActivationPaths = {
  event: data.eventRequestPath,
  jsSdk: data.jsSdkRequestPath
};

const requestPath = getRequestPath();
const requestMethod = getRequestMethod();

if (isEventRequest()) {
  const rawEvents = getEventsFromRequest();

  const isInvalidEventsRequest = !rawEvents;
  if (isInvalidEventsRequest) {
    log('Request is invalid. Missing events.');
    return;
  }

  claimRequest();
  log(requestPath + ' request claimed');

  const events = mapToCommonEventData(rawEvents);

  let counter = 0;
  events.forEach((event) => {
    runContainer(event, () => {
      if (++counter === events.length) {
        const origin = getRequestHeader('origin');
        if (origin) {
          setResponseHeader('access-control-allow-origin', origin);
          setResponseHeader('access-control-allow-credentials', 'true');
        }

        rewriteClientSideCookies();

        setPixelResponse();
        returnResponse();
      }
    });
  });
} else if (isJsSdkRequest()) {
  if (!data.serveJsSdk) {
    log('Request for JS file ignored – request serving not enabled in Client.');
    return;
  }

  if (!validateJsSdkOrigin()) {
    log('Request originated from invalid origin');
    return;
  }

  claimRequest();
  log(requestPath + ' request claimed');

  const storageJsBodyKey = 'piano-analytics-js';
  const storageHeadersKey = storageJsBodyKey + '-headers';
  const storageStoredAtKey = storageJsBodyKey + '-stored-at';
  const storedJsBody = templateDataStorage.getItemCopy(storageJsBodyKey);
  const storedHeaders = templateDataStorage.getItemCopy(storageHeadersKey);
  const storedAt = templateDataStorage.getItemCopy(storageStoredAtKey);

  const now = getTimestampMillis();
  const twelveHoursAgo = now - 43200000; // 43200000 ms = 12 hours

  if (!storedJsBody || storedAt < twelveHoursAgo) {
    const jsSdkEndpoint =
      'https://tag.aticdn.net' +
      (data.jsSdkRequestPathOverride
        ? data.jsSdkRequestPathOverriden
        : clientActivationPaths.jsSdk);
    log('No cache hit or cache expired, fetching ' + jsSdkEndpoint + ' over the network.');
    sendHttpGet(jsSdkEndpoint)
      .then((result) => {
        if (result.statusCode === 200) {
          templateDataStorage.setItemCopy(storageJsBodyKey, result.body);
          templateDataStorage.setItemCopy(storageHeadersKey, result.headers);
          templateDataStorage.setItemCopy(storageStoredAtKey, now);
        }
        sendProxyResponse(result.body, result.headers, result.statusCode);
      })
      .catch((error) => {
        log(
          'Failed to fetch ' + jsSdkEndpoint + ' over the network. Reason: ' + JSON.stringify(error)
        );
        sendProxyResponse('', {}, 500);
      });
  } else {
    log('Cache hit successful, fetching ' + requestPath + ' from sGTM storage.');
    sendProxyResponse(storedJsBody, storedHeaders, 200);
  }
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function isEventRequest() {
  return (
    requestPath === clientActivationPaths.event && ['GET', 'POST'].indexOf(requestMethod) !== -1
  );
}

function isJsSdkRequest() {
  return requestPath === clientActivationPaths.jsSdk && requestMethod === 'GET';
}

function validateJsSdkOrigin() {
  const requestOrigin =
    getRequestHeader('origin') ||
    (!!getRequestHeader('referer') && parseUrl(getRequestHeader('referer')).origin) ||
    null;
  const allowedOrigins = data.jsSdkAllowedOrigins;
  return (
    allowedOrigins === '*' ||
    allowedOrigins
      .split(',')
      .map((origin) => origin.trim())
      .indexOf(requestOrigin) > -1
  );
}

function sendProxyResponse(response, headers, statusCode) {
  setResponseStatus(statusCode);
  setResponseBody(response);

  for (const key in headers) {
    setResponseHeader(key, headers[key]);
  }

  returnResponse();
}

function getEventsFromRequest() {
  const requestBody = getRequestBody();
  return requestMethod === 'POST' && requestBody
    ? JSON.parse(requestBody).events
    : JSON.parse(getRequestQueryParameter('events') || null);
}

function mapToCommonEventData(rawEvents) {
  const serverSideVisitorId = getServerSideVisitorId(rawEvents);
  const clientSideVisitorId = getRequestQueryParameter('idclient');
  const visitorId = serverSideVisitorId || clientSideVisitorId;

  const siteId = getRequestQueryParameter('s');

  const events = rawEvents.map((rawEvent) => {
    const eventName = rawEvent.name;
    const rawData = rawEvent.data;
    const sourceUrl = parseUrl(rawData.event_url_full) || {};

    let language;
    if (rawData.browser_language && rawData.browser_language_local) {
      language = (rawData.browser_language + '-' + rawData.browser_language_local).toLowerCase();
    } else {
      language = ((getRequestHeader('accept-language') || '').split(';')[0] || '')
        .split(',')[0]
        .toLowerCase();
    }

    let value;
    if (getType(rawData.product_pricetaxfree) === 'number') value = rawData.product_pricetaxfree;
    else if (getType(rawData.cart_turnovertaxfree) === 'number')
      value = rawData.cart_turnovertaxfree;

    // Common event data from https://developers.google.com/tag-platform/tag-manager/server-side/common-event-data
    const commonEventData = cleanObj({
      event_name: eventName,
      client_id: visitorId,
      ip_override: getRemoteAddress(),
      currency: rawData.cart_currency,
      language: language,
      page_hostname: sourceUrl.hostname,
      page_location: rawData.event_url_full,
      page_path: sourceUrl.pathname,
      page_referrer: rawData.previous_url,
      page_title: rawData.page_title_html,
      screen_resolution:
        rawData.device_screen_width && rawData.device_screen_height
          ? rawData.device_screen_width + 'x' + rawData.device_screen_height
          : undefined,
      user_agent: getRequestHeader('user-agent'),
      user_id: rawData.user_id,
      value: value,
      viewport_size:
        rawData.device_display_width && rawData.device_display_height
          ? rawData.device_display_width + 'x' + rawData.device_display_height
          : undefined
    });

    // Keep the original information prefixed by 'x-pa-'.
    return mergeObj(commonEventData, {
      'x-pa-site-id': siteId,
      'x-pa-idclient': visitorId,
      'x-pa-data': rawData
    });
  });

  return events;
}

function getServerSideVisitorId(rawEvents) {
  // https://developers.atinternet-solutions.com/piano-analytics/data-collection/general/cookie-storage

  const useServerSideCookiesForVisitorID = isUIFieldTrue(data.useServerSideCookiesForVisitorID);
  const isServerSideCookieVisitorIDAllowedByPrivacyMode =
    (data.serverSideCookiesAllowedVisitorPrivacyMode || '')
      .split(',')
      .filter((value) => !!value)
      .map((value) => value.trim().toLowerCase())
      .indexOf(rawEvents[0].data.visitor_privacy_mode.toLowerCase()) !== -1;
  const isAppRequest =
    (getRequestHeader('user-agent') || '').indexOf('Piano Analytics SDK') !== -1 ||
    rawEvents[0].data.event_collection_platform !== 'js'; // App or using opt-out mode.

  const shouldNotUseServerSideVisitorId =
    !useServerSideCookiesForVisitorID ||
    !isServerSideCookieVisitorIDAllowedByPrivacyMode ||
    isAppRequest;
  if (shouldNotUseServerSideVisitorId) {
    return;
  }

  // Cookies that are set automatically by Piano via redirect 30X when the request does not contain
  // the 'idclient' query string or the atid/atidx cookies. We create them manually here.
  const cookiesName = [
    // SDK version >= 6.8.0
    'atid',
    'atidx',
    // SDK version < 6.8.0
    'idrxvr'
  ];

  let serverSideVisitorId;
  cookiesName.some((cookieName) => {
    const cookieValue = getCookieValues(cookieName)[0];
    if (!cookieValue) return;
    serverSideVisitorId = cookieValue;
    return true;
  });

  if (!serverSideVisitorId) serverSideVisitorId = generateUUID();

  // Do not set 'idrxvr'.
  cookiesName
    .filter((cookieName) => cookieName !== 'idrxvr')
    .forEach((cookieName) => {
      const options = {
        domain: data.serverSideCookiesDomain || 'auto',
        path: data.serverSideCookiesPath || '/',
        secure: true,
        'max-age': makeInteger(data.serverSideCookiesExpiration) || 34128000, // 395 days
        httponly: true
      };
      if (cookieName === 'atid') options.samesite = 'none';
      setCookie(cookieName, serverSideVisitorId, options);
    });

  return serverSideVisitorId;
}

function rewriteClientSideCookies() {
  // https://developers.atinternet-solutions.com/piano-analytics/data-collection/general/cookie-storage

  if (!isUIFieldTrue(data.rewriteClientSideCookies)) {
    return;
  }

  [
    // SDK version >= 6.8.0
    '_pcid',
    '_pctx',
    '_pprv',
    'pa_user',
    'pa_privacy',
    // SDK version < 6.8.0
    'pa_vid'
  ].forEach((cookieName) => {
    const cookieValue = getCookieValues(cookieName)[0];
    if (!cookieValue) return;
    setCookie(cookieName, cookieValue, {
      domain: data.clientSideCookiesDomain || 'auto',
      path: data.clientSideCookiesPath || '/',
      samesite: data.clientSideCookiesSameSite || 'lax',
      secure: true,
      'max-age': makeInteger(data.clientSideCookiesExpiration) || 34128000, // 13 months in seconds
      httponly: false
    });
  });
}

/*==============================================================================
  Helpers
==============================================================================*/

function log(msg) {
  logToConsole('[Piano Analytics Client] ', msg);
}

function mergeObj(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) target[key] = source[key];
  }
  return target;
}

function cleanObj(obj) {
  const target = {};
  Object.keys(obj).forEach((k) => {
    if (getType(obj[k]) !== 'null' && getType(obj[k]) !== 'undefined') target[k] = obj[k];
  });
  return target;
}

function isUIFieldTrue(field) {
  return [true, 'true'].indexOf(field) !== -1;
}

function random() {
  return generateRandom(1000000000000000, 10000000000000000) / 10000000000000000;
}

function generateUUID() {
  function s(n) {
    return h((random() * (1 << (n << 2))) ^ getTimestampMillis()).slice(-n);
  }
  function h(n) {
    return (n | 0).toString(16);
  }
  return [
    s(4) + s(4),
    s(4),
    '4' + s(3),
    h(8 | (random() * 4)) + s(3),
    getTimestampMillis().toString(16).slice(-10) + s(2)
  ]
    .join('-')
    .toUpperCase();
}
