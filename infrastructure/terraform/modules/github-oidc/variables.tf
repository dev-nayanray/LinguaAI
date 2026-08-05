variable "name" {
  description = "Name prefix for the deploy role (e.g. \"linguaai\")."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository in \"<owner>/<repo>\" form, e.g. \"linguaai/linguaai\". Scopes which repository's workflows may assume the deploy role."
  type        = string
}

variable "allowed_environments" {
  description = <<-EOT
    GitHub Environments (deploy-staging.yml/deploy-production.yml's
    `environment:` key) permitted to assume the deploy role, e.g.
    ["staging", "production"]. Trust is scoped to the OIDC token's
    environment-scoped `sub` claim rather than a branch ref: GitHub only
    issues that claim after the environment's own protection rules pass
    (e.g. production's required-reviewers gate, configured in GitHub repo
    settings, not Terraform) — so the manual-approval requirement is
    enforced at the AWS credential level, not just the workflow-UI level.
  EOT
  type        = list(string)
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
