// Netlify Function: proxies read-only OData calls to SAP's public sandbox
// so the API Key never reaches the browser. Deployed automatically by
// Netlify from netlify/functions/ — no extra config needed.
//
// SETUP: In Netlify site settings > Environment variables, add:
//   SF_SANDBOX_API_KEY = <your personal key from api.sap.com>

const SANDBOX_BASE = 'https://sandbox.api.sap.com/successfactors/odata/v2';

exports.handler = async (event) => {
  const apiKey = process.env.SF_SANDBOX_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'SF_SANDBOX_API_KEY is not set in Netlify environment variables.' }),
    };
  }

  const path = event.queryStringParameters && event.queryStringParameters.path;
  if (!path) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required 'path' query parameter, e.g. ?path=User('abirken')/directReports" }),
    };
  }

  // Only allow GET — this proxy is read-only by design.
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Only GET is supported.' }) };
  }

  const url = `${SANDBOX_BASE}/${path}?$format=json`;

  try {
    const upstream = await fetch(url, {
      headers: {
        APIKey: apiKey,
        Accept: 'application/json',
      },
    });
    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: { 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach SAP sandbox', detail: String(err) }),
    };
  }
};
