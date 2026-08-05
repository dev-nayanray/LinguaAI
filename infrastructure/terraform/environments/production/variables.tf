variable "aws_region" {
  description = "Primary AWS region for production."
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "image_tag" {
  description = "Immutable image tag (Git SHA) to deploy — set by deploy-production.yml (T23), never a static default. Promoted from a staging-verified image, per DEPLOYMENT.md §4."
  type        = string
}

variable "domain_name" {
  description = "Production domain name, e.g. \"linguaai.com\". Left empty until a real domain is provisioned for this Epic."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  type    = string
  default = ""
}

variable "sentry_dsn_secret_arn" {
  description = "Secrets Manager ARN holding the production Sentry DSN (E1 Part 8 — populated out of band, not by this Terraform run)."
  type        = string
}

variable "budget_alert_emails" {
  type = list(string)
}
