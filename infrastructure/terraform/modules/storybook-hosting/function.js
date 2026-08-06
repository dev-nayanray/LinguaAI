// ADR-026 (docs/DECISIONS.md) — Storybook access-control CloudFront
// Function. Runs on `viewer-request` (associated in main.tf). Targets the
// `cloudfront-js-2.0` runtime specifically: `cf.kvs()` (async KVS reads)
// and the synchronous `crypto.digest()` API are both 2.0-only additions,
// absent from the older `cloudfront-js-1.0` runtime — using either
// requires 2.0 to be selected on the `aws_cloudfront_function` resource.
//
// Never sees or compares the raw credential — only ever compares
// SHA-256(salt + credential) against the KVS-stored hash, matching
// ADR-026's "the CloudFront Function never sees the raw secret or calls
// Secrets Manager directly" (Terraform resolves the real credential and
// computes the salt at apply time; this function only ever reads the
// resulting hash + salt back out of the KVS at request time).
//
// Verification-honesty note (this module's own header comment repeats
// this): written to match AWS's documented cloudfront-js-2.0 capability
// set, but has not been deployed or exercised against a real CloudFront
// distribution — RISK_REGISTER.md R-64 tracks that residual explicitly.

import cf from 'cloudfront';

async function handler(event) {
  var request = event.request;
  var headers = request.headers;

  var kvsHandle = cf.kvs();
  var storedHash;
  var storedSalt;
  try {
    storedHash = await kvsHandle.get('credential-hash');
    storedSalt = await kvsHandle.get('credential-salt');
  } catch (err) {
    // Fail closed (ADR-026's explicit "Secret management" rule): a KVS
    // read failure is treated as unauthenticated, never as a bypass.
    return unauthorizedResponse();
  }

  if (!storedHash || !storedSalt) {
    return unauthorizedResponse();
  }

  var authHeader = headers.authorization && headers.authorization.value;
  if (!authHeader || authHeader.slice(0, 6) !== 'Basic ') {
    return unauthorizedResponse();
  }

  var decodedCredential;
  try {
    // The full decoded "user:password" string is the one opaque shared
    // credential (ADR-026) — not parsed into separate username/password
    // fields, since there is exactly one credential for every viewer.
    decodedCredential = atob(authHeader.slice(6));
  } catch (err) {
    return unauthorizedResponse();
  }

  var computedHash = crypto.digest('SHA-256', storedSalt + decodedCredential, 'hex');

  if (computedHash !== storedHash) {
    return unauthorizedResponse();
  }

  return request;
}

function unauthorizedResponse() {
  return {
    statusCode: 401,
    statusDescription: 'Unauthorized',
    headers: {
      'www-authenticate': { value: 'Basic realm="Storybook preview"' },
    },
  };
}
