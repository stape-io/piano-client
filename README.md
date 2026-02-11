# Piano Analytics Client for Server-Side GTM by Stape

The **Piano Analytics Client for Server-Side GTM** handles incoming requests in the [Piano Analytics](https://developers.atinternet-solutions.com/piano-analytics) schema format. It converts web and app tracking data into a format that can be used by Tags inside sGTM. It can also serve the official `piano-analytics.js` JS SDK file directly from your server.

It's designed to integrate seamlessly with the [Piano Analytics Tag by Stape](https://github.com/stape-io/piano-tag).

## What This Client Does

- **Claims and processes Piano Analytics event requests** sent to a specific path (default: `/event`)
- **Parses incoming event data** into the Common Event Data format and passes them to your container
- **Manages Piano cookies**, either by rewriting client-side cookies or by using server-side cookies for visitor identification
- **Optionally serves the JavaScript SDK file** (`piano-analytics.js`) from your domain to improve loading speed and resilience

## Features

### 🎯 Event Handling

- Accepts requests via `GET` or `POST` to a specified path (e.g., `/event`)
- Extracts and maps each Piano Analytics event into a format compatible with GTM Server
- Runs the container for each event individually

### 🍪 Cookie Management

- **Rewrite Client-Side Cookies**: Rewrites Piano cookies like `_pcid`, `pa_user`, and others for improved consistency
- **Use Server-Side Cookies for Visitor ID**: Securely stores the Visitor ID in HTTP-only cookies, if user consent allows

### 💻 SDK Hosting (Web Only)

- Optionally serves the `piano-analytics.js` SDK file from your server
- Cached for 12 hours and auto-refreshed when stale
- Supports origin allowlisting for secure SDK delivery

## Setup Instructions

1. **Install the Client in your sGTM container**
2. **Configure the Event Request Path**
   Default: `/event`. All incoming Piano event requests should be routed to this path.

3. (Optional) **Enable JS SDK Hosting**
   If you'd like your server to serve the Piano SDK file:
   - Set `Serve piano-analytics.js JS SDK` to `true`
   - Define the `JS SDK Request Path` (default: `/piano-analytics.js`)
   - Add allowed origins to limit which domains can load the file

4. (Optional) **Configure Cookie Behavior**
   - Enable client-side cookie rewriting for better reliability across tracking contexts
   - Enable server-side cookies for Visitor ID; if using privacy modes like `optin` or `exempt` (which can be modified if needed)

## Parameters

| Field                                    | Description                                                    |
| ---------------------------------------- | -------------------------------------------------------------- |
| `Events Request Path`                    | Path where event data will be received (e.g. `/event`)         |
| `Serve piano-analytics.js JS SDK`        | If enabled, allows sGTM to serve the JS SDK directly           |
| `Allowed Origins`                        | Comma-separated list of domains allowed to fetch the JS SDK    |
| `Rewrite Client-Side Cookies`            | Rewrites Piano cookies with server-side control                |
| `Use Server-Side cookies for Visitor ID` | Creates HTTP-only cookies to store and use visitor ID securely |

## Use Cases

- Reduce reliance on Piano's CDN by self-hosting the JS SDK
- Improve data quality by rewriting or managing cookies server-side
- Enable secure Visitor ID tracking that respects user privacy preferences
- Integrate Piano Analytics events with other tools via sGTM

## Notes

- Visitor ID server-side cookies are only created if the `visitor_privacy_mode` is allowed
- SDK caching lasts 12 hours and automatically refreshes in the background
- The client avoids setting cookies for app requests or when consent is not granted

## Useful Resources:

- [Step-by-step guide on how to configure Piano server-side tracking](https://stape.io/blog/piano-analytics-server-side-tracking-guide)

## Open Source

The **Piano Analytics Client for Google Tag Manager Server-Side** is developed and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.
