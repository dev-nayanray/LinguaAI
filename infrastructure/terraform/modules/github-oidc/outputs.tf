output "deploy_role_arn" {
  description = "IAM role ARN deploy-staging.yml/deploy-production.yml assume via aws-actions/configure-aws-credentials' role-to-assume input."
  value       = aws_iam_role.deploy.arn
}

output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github_actions.arn
}
