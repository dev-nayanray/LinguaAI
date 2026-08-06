variable "name" {
  description = "Name prefix for every resource in this module (e.g. \"linguaai\")."
  type        = string
}

# Matches this repo's existing convention (var.sentry_dsn_secret_arn,
# var.db_master_secret_arn in modules/compute) — a real credential value
# is created out-of-band by an operator and referenced here by ARN, never
# generated or owned by Terraform. See main.tf's header comment for how
# this module's own salt (which Terraform *does* generate and own) stays
# independent of this value while still rotating together with it.
variable "basic_auth_credential_secret_arn" {
  description = "ARN of a pre-existing Secrets Manager secret holding the raw \"user:password\" Basic-Auth credential shared by every Storybook preview viewer (ADR-026 — a single shared credential, not per-user)."
  type        = string
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
