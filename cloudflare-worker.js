/**
 * Cloudflare Worker - ITAD API Proxy
 *
 * This worker proxies requests to IsThereAnyDeal API to avoid CORS issues.
 * Deploy this to Cloudflare Workers (free tier works great!)
 *
 * Setup Instructions:
 * 1. Go to https://workers.cloudflare.com/
 * 2. Sign up for free account
 * 3. Create new Worker
 * 4. Copy this code into the worker editor
 * 5. Add your ITAD API key as environment variable: ITAD_API_KEY
 * 6. Deploy!
 * 7. Update WORKER_URL in script.js with your worker URL
 */

// Your ITAD API key (set this as environment variable in Cloudflare dashboard)
const ITAD_API_KEY = '99e0e63eb8ed51b7f92fde653aa38ffdead5be40';

// Allowed origins (your website)
const ALLOWED_ORIGINS = [
  'https://gamevaultdeals.com',
  'https://www.gamevaultdeals.com',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8000'
];

// CORS headers
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// Handle OPTIONS request (preflight)
function handleOptions(request) {
  const origin = request.headers.get('Origin');

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return new Response(null, {
      headers: corsHeaders(origin)
    });
  }

  return new Response(null, {
    status: 403,
    statusText: 'Forbidden'
  });
}

// Main request handler
async function handleRequest(request) {
  const origin = request.headers.get('Origin');

  // Check origin
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  try {
    // Parse the request URL
    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint') || '/deals/list/';

    // Build ITAD API URL
    const itadUrl = new URL(`https://api.isthereanydeal.com${endpoint}`);

    // Copy query parameters (except 'endpoint')
    for (const [key, value] of url.searchParams) {
      if (key !== 'endpoint') {
        itadUrl.searchParams.set(key, value);
      }
    }

    // Add API key
    itadUrl.searchParams.set('key', ITAD_API_KEY);

    console.log('Proxying to ITAD:', itadUrl.toString());

    // Fetch from ITAD
    const itadResponse = await fetch(itadUrl.toString(), {
      method: request.method,
      headers: {
        'User-Agent': 'GameVaultDeals/1.0',
      }
    });

    // Get response data
    const data = await itadResponse.text();

    // Return with CORS headers
    return new Response(data, {
      status: itadResponse.status,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900', // 15 minutes cache
      }
    });

  } catch (error) {
    console.error('Proxy error:', error);

    return new Response(JSON.stringify({
      error: 'Proxy error',
      message: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json'
      }
    });
  }
}

// Cloudflare Worker entry point
addEventListener('fetch', event => {
  const request = event.request;

  if (request.method === 'OPTIONS') {
    event.respondWith(handleOptions(request));
  } else {
    event.respondWith(handleRequest(request));
  }
});
