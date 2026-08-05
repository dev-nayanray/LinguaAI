# T23 fix: nothing in T18's original design established how
# deploy-staging.yml/deploy-production.yml would authenticate to AWS at
# all. Keyless OIDC (no long-lived AWS access keys to leak) — the same
# philosophy ADR-017 already applies to cosign's image signing.
#
# Account-level resource, applied once — like modules/state-backend, NOT
# duplicated per environment (an aws_iam_openid_connect_provider for a
# given issuer URL can only exist once per AWS account; a second
# `terraform apply` targeting the same account would conflict). If
# staging and production are ever split into separate AWS accounts, this
# module is applied once per account instead.

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]

  tags = var.tags
}

resource "aws_iam_role" "deploy" {
  name = "${var.name}-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github_actions.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # One condition value per allowed environment — GitHub's
          # environment-scoped sub claim format is
          # "repo:<owner>/<repo>:environment:<name>".
          "token.actions.githubusercontent.com:sub" = [
            for env in var.allowed_environments : "repo:${var.github_repository}:environment:${env}"
          ]
        }
      }
    }]
  })

  tags = var.tags
}

# T18's Terraform provisions VPC/subnets, RDS, ElastiCache, S3, ECS,
# IAM roles, ALB/CloudFront/WAF/Route53, DynamoDB, SNS, and Budgets —
# `terraform apply` genuinely needs broad permissions across all of
# those AWS services. Scoping this down to a tight least-privilege
# policy is real, valuable follow-up work (tracked, not silently
# skipped) once the module set stabilizes; AdministratorAccess is the
# pragmatic starting point every Terraform CI role in practice begins
# from, not a shortcut unique to this repo.
resource "aws_iam_role_policy_attachment" "deploy_admin" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
