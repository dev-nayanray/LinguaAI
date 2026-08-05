variable "aws_region" {
  description = "Primary AWS region for staging."
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

variable "image_tag" {
  description = "Immutable image tag (Git SHA) to deploy — set by deploy-staging.yml (T23), never a static default."
  type        = string
}

variable "domain_name" {
  description = "Staging domain name, e.g. \"staging.linguaai.com\". Left empty until a real domain is provisioned for this Epic."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  type    = string
  default = ""
}

variable "sentry_dsn_secret_arn" {
  description = "Secrets Manager ARN holding the staging Sentry DSN (E1 Part 8 — populated out of band, not by this Terraform run)."
  type        = string
}

variable "budget_alert_emails" {
  type = list(string)
}
