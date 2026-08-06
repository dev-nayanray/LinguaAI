# E3 T17 / ADR-026 (docs/DECISIONS.md) — hosted, access-restricted
# preview of packages/ui's Storybook build. Account-level, applied once —
# like modules/preview and modules/github-oidc, not duplicated per
# environment (docs/epics/E3-design-system-component-library.md §18:
# "the edge module's existing distribution has no S3 origin today" — this
# is a wholly separate distribution from modules/edge's production one,
# by explicit choice: an internal, Basic-Auth-gated review tool has a
# different threat model and change cadence than the production
# app-serving distribution, and this repo's modules are otherwise
# narrowly scoped one-concern-per-module throughout).
#
# One shared bucket/distribution serves every open PR's Storybook build
# at its own S3 key prefix (e.g. "pr-123/") — preview.yml (this task's
# other half) uploads each PR's build there and deletes the prefix on
# PR-close, the same "shared infra, per-PR path" shape CloudFront itself
# is built around, and far cheaper than a new CloudFront distribution per
# PR (distribution creation/propagation takes minutes, unlike App
# Runner's fast create/destroy that justified per-PR resources in
# modules/preview).
#
# Secret/salt design note — a deliberate, documented deviation from
# ADR-026's literal "stored as its own field in the same Secrets Manager
# secret, alongside the raw credential" wording: that would require
# Terraform to read the existing credential's JSON, splice in a `salt`
# field, and write the whole value back — a read-modify-write against a
# secret this repo's own convention (var.sentry_dsn_secret_arn,
# var.db_master_secret_arn in modules/compute) never has Terraform own or
# mutate, only reference by ARN. Instead, the salt lives in its own,
# separate, Terraform-owned secret. Every requirement ADR-026 actually
# states is still met: the salt is independent of the credential (never
# derived from it), and rotation-together is guaranteed structurally —
# random_password.storybook_salt's `keepers` ties its lifetime to the
# credential secret's own `version_id`, so any out-of-band credential
# rotation (an operator running `aws secretsmanager put-secret-value`,
# which always assigns a new version_id even for an unchanged value)
# forces the salt to regenerate on the next `terraform apply`, exactly
# ADR-026's stated guarantee, without Terraform ever writing to a secret
# it doesn't fully own.

data "aws_secretsmanager_secret_version" "basic_auth_credential" {
  secret_id = var.basic_auth_credential_secret_arn
}

resource "random_password" "storybook_salt" {
  length  = 32
  special = false # KVS values and the CloudFront Function's string comparison have no need for symbol characters

  keepers = {
    credential_version_id = data.aws_secretsmanager_secret_version.basic_auth_credential.version_id
  }
}

resource "aws_secretsmanager_secret" "storybook_salt" {
  name        = "${var.name}-storybook-salt"
  description = "ADR-026: independent salt for the Storybook Basic-Auth credential hash, regenerated whenever the credential (var.basic_auth_credential_secret_arn) rotates."

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "storybook_salt" {
  secret_id     = aws_secretsmanager_secret.storybook_salt.id
  secret_string = random_password.storybook_salt.result
}

locals {
  # ADR-026: SHA-256(salt + credential), never the raw credential itself,
  # is what reaches the KVS the CloudFront Function reads at request time.
  credential_hash = sha256("${random_password.storybook_salt.result}${data.aws_secretsmanager_secret_version.basic_auth_credential.secret_string}")
}

# --- CloudFront KeyValueStore (read by function.js's cf.kvs() at request time) ---

resource "aws_cloudfront_key_value_store" "storybook_auth" {
  name    = "${var.name}-storybook-auth"
  comment = "ADR-026: credential-hash / credential-salt entries for the Storybook Basic-Auth CloudFront Function."
}

resource "aws_cloudfrontkeyvaluestore_key" "credential_hash" {
  key_value_store_arn = aws_cloudfront_key_value_store.storybook_auth.arn
  key                 = "credential-hash"
  value               = local.credential_hash
}

resource "aws_cloudfrontkeyvaluestore_key" "credential_salt" {
  key_value_store_arn = aws_cloudfront_key_value_store.storybook_auth.arn
  key                 = "credential-salt"
  value               = random_password.storybook_salt.result
}

# --- CloudFront Function (viewer-request Basic-Auth gate, function.js) ---

resource "aws_cloudfront_function" "storybook_auth" {
  name    = "${var.name}-storybook-auth"
  comment = "ADR-026: Storybook preview Basic-Auth gate — salted-hash comparison against the KVS above, never the raw credential."
  runtime = "cloudfront-js-2.0" # 2.0-only: cf.kvs()'s async reads and crypto.digest() are both absent from 1.0
  publish = true
  code    = file("${path.module}/function.js")

  key_value_store_associations = [aws_cloudfront_key_value_store.storybook_auth.arn]
}

# --- S3 origin (never public — read only via CloudFront's Origin Access Control) ---

resource "aws_s3_bucket" "storybook" {
  bucket = "${var.name}-storybook-preview"

  tags = var.tags
}

resource "aws_s3_bucket_public_access_block" "storybook" {
  bucket = aws_s3_bucket.storybook.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# §18's "X-Robots-Tag: noindex + robots.txt disallow" — the response-
# headers policy below covers every request; this static object is the
# `/robots.txt` request itself (an internal preview tool must never be
# indexed, and unlike the header, a crawler's robots.txt fetch happens
# before any Basic-Auth challenge would normally stop it in practice).
resource "aws_s3_object" "robots_txt" {
  bucket       = aws_s3_bucket.storybook.id
  key          = "robots.txt"
  content      = "User-agent: *\nDisallow: /\n"
  content_type = "text/plain"
}

resource "aws_cloudfront_origin_access_control" "storybook" {
  name                              = "${var.name}-storybook"
  description                       = "Storybook preview S3 origin access control"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "storybook" {
  bucket = aws_s3_bucket.storybook.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipalReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.storybook.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.storybook.arn
        }
      }
    }]
  })
}

# --- Response headers (X-Robots-Tag: noindex, §18) ---

resource "aws_cloudfront_response_headers_policy" "storybook" {
  name = "${var.name}-storybook-noindex"

  custom_headers_config {
    items {
      header   = "X-Robots-Tag"
      value    = "noindex"
      override = true
    }
  }
}

# --- CloudFront distribution ---

resource "aws_cloudfront_distribution" "storybook" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "Storybook PR preview (packages/ui) — Basic-Auth gated, ADR-026"

  origin {
    domain_name              = aws_s3_bucket.storybook.bucket_regional_domain_name
    origin_id                = "storybook-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.storybook.id
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "storybook-s3"
    viewer_protocol_policy     = "redirect-to-https"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.storybook.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.storybook_auth.arn
    }

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # No custom domain (an internal preview tool doesn't need one — the
  # *.cloudfront.net default domain is sufficient, matching modules/edge's
  # own no-domain fallback for the same underlying reason: HTTPS still
  # works via CloudFront's own default certificate either way).
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  # ADR-026 §18 "WAF" bullet: ships v1 without a distribution-scoped WAF
  # ACL — a stated decision (RISK_REGISTER.md R-65), not an oversight.

  tags = var.tags
}
