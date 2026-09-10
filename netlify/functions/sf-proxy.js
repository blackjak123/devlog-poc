// Netlify Function: proxies OData calls to SAP SuccessFactors.
//
// READS (GET): work against the public sandbox using just an API key.
//   SETUP: Netlify env var SF_SANDBOX_API_KEY = <personal key from api.sap.com>
//
// WRITES (POST to Activities only): SAP's sandbox rejects writes without
// real tenant Basic Auth (confirmed by direct test — see AUTH0002 error).
// This is gated on real company credentials that don't exist yet. Once
// IT provisions a sandbox tenant, set these Netlify env vars and writes
// will work with no code changes:
//   SF_TENANT_USERNAME   e.g. sfadmin
//   SF_TENANT_COMPANY_ID e.g. SFPART012345
//   SF_TENANT_PASSWORD
//   SF_API_BASE_URL      the tenant's real API host, e.g.
//                        https://apisalesdemo8.successfactors.com/odata/v2
//                        (defaults to the public sandbox, which will keep
//                        rejecting writes until this is overridden)

const DEFAULT_BASE = 'https://sandbox.api.sap.com/successfactors/odata/v2';
const WRITABLE_PATHS = ['activities']; // whitelist — nothing else can be POSTed

exports.handler = async (event) => {
  const apiKey = process.env.SF_SANDBOX_API_KEY;
  const path = event.queryStringParameters && event.queryStringParameters.path;

  if (!path) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required 'path' query parameter, e.g. ?path=User('abirken')/directReports" }),
    };
  }

  if (event.httpMethod === 'GET') {
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'SF_SANDBOX_API_KEY is not set in Netlify environment variables.' }) };
    }
    const url = `${DEFAULT_BASE}/${path}?$format=json`;
    try {
      const upstream = await fetch(url, { headers: { APIKey: apiKey, Accept: 'application/json' } });
      const text = await upstream.text();
      return { statusCode: upstream.status, headers: { 'Content-Type': 'application/json' }, body: text };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to reach SAP sandbox', detail: String(err) }) };
    }
  }

  if (event.httpMethod === 'POST') {
    const bareEntity = path.split('(')[0].split('?')[0];
    if (!WRITABLE_PATHS.includes(bareEntity)) {
      return { statusCode: 403, body: JSON.stringify({ error: `Writes to '${bareEntity}' are not allowed. Only ${WRITABLE_PATHS.join(', ')} can be posted.` }) };
    }

    const { SF_TENANT_USERNAME, SF_TENANT_COMPANY_ID, SF_TENANT_PASSWORD } = process.env;
    if (!SF_TENANT_USERNAME || !SF_TENANT_COMPANY_ID || !SF_TENANT_PASSWORD) {
      return {
        statusCode: 501,
        body: JSON.stringify({
          error: 'Real tenant credentials not yet configured. Writes to SF require SF_TENANT_USERNAME, SF_TENANT_COMPANY_ID, and SF_TENANT_PASSWORD env vars — the public sandbox rejects writes with an API key alone.',
        }),
      };
    }

    const base = process.env.SF_API_BASE_URL || DEFAULT_BASE;
    const auth = Buffer.from(`${SF_TENANT_USERNAME}@${SF_TENANT_COMPANY_ID}:${SF_TENANT_PASSWORD}`).toString('base64');
    const url = `${base}/${path}?$format=json`;

    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: event.body,
      });
      const text = await upstream.text();
      return { statusCode: upstream.status, headers: { 'Content-Type': 'application/json' }, body: text };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to reach SF tenant', detail: String(err) }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Only GET and POST are supported.' }) };
};
