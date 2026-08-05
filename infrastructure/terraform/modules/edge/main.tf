# --- WAF (regional, attached to the ALB — DEPLOYMENT.md §1 topology) ---

resource "aws_wafv2_web_acl" "alb" {
  name        = "${var.name}-alb"
  description = "Baseline managed-rule protection for the ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-common-rule-set"
    priority = 0

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-common-rule-set"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-known-bad-inputs"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-alb"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

# --- ALB ---

resource "aws_lb" "this" {
  name               = var.name
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  tags = var.tags
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.this.arn
  web_acl_arn  = aws_wafv2_web_acl.alb.arn
}

# HTTPS requires a certificate, which requires a real domain — a skeleton
# environment without one yet still needs a plannable, working ALB, so
# HTTP-only is the fallback rather than a hard failure.
resource "aws_acm_certificate" "this" {
  count = var.domain_name != "" ? 1 : 0

  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_lb_listener" "https" {
  count = var.domain_name != "" ? 1 : 0

  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.this[0].arn

  default_action {
    type             = "forward"
    target_group_arn = var.target_group_arns[var.default_service]
  }
}

# Not a weak-cipher finding — this listener is plain HTTP only as a
# no-domain-yet fallback (see the dynamic default_action blocks below):
# once var.domain_name is set, every request redirects to the HTTPS
# listener above, which does set a strong ssl_policy (T20 semgrep
# finding). A skeleton environment with no real domain provisioned yet
# still needs to be reachable.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP" # nosemgrep: terraform.aws.security.insecure-load-balancer-tls-version.insecure-load-balancer-tls-version

  # Redirect to HTTPS once a certificate exists; otherwise serve directly
  # so the skeleton is reachable without a domain.
  dynamic "default_action" {
    for_each = var.domain_name != "" ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.domain_name == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = var.target_group_arns[var.default_service]
    }
  }
}

# Path-based routing for every non-default service — apps/web (the
# default) is the only service assumed to own "/"; everything else is
# reachable at /<service-name>/* until each service's real domain/path
# contract is decided by the epic that builds its first real endpoint.
resource "aws_lb_listener_rule" "path_routed" {
  for_each = { for k, v in var.target_group_arns : k => v if k != var.default_service }

  listener_arn = var.domain_name != "" ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  priority     = 100 + index(keys(var.target_group_arns), each.key)

  action {
    type             = "forward"
    target_group_arn = each.value
  }

  condition {
    path_pattern {
      values = ["/${each.key}/*"]
    }
  }
}

# --- CloudFront (DEPLOYMENT.md §1: CDN + edge caching in front of the ALB) ---

# minimum_protocol_version (viewer_certificate block below) is only
# settable with a custom ACM cert — AWS forces TLSv1 support on
# cloudfront_default_certificate, a platform constraint, not a Terraform
# gap (T20 semgrep finding). The real fix applies once a domain/cert
# exists; the no-domain fallback can't be hardened further while still
# being reachable.
# nosemgrep: terraform.aws.security.aws-cloudfront-insecure-tls.aws-insecure-cloudfront-distribution-tls-version
resource "aws_cloudfront_distribution" "this" {
  enabled = true
  aliases = var.domain_name != "" ? [var.domain_name] : []

  origin {
    domain_name = aws_lb.this.dns_name
    origin_id   = "alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = var.domain_name != "" ? "https-only" : "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      headers      = ["*"]

      cookies {
        forward = "all"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.domain_name == ""
    acm_certificate_arn            = var.domain_name != "" ? aws_acm_certificate.this[0].arn : null
    ssl_support_method             = var.domain_name != "" ? "sni-only" : null
    minimum_protocol_version       = var.domain_name != "" ? "TLSv1.2_2021" : null
  }

  tags = var.tags
}

# --- Route53 ---

resource "aws_route53_record" "this" {
  count = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}
