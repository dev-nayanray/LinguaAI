output "apprunner_ecr_access_role_arn" {
  description = "IAM role ARN preview.yml passes as AuthenticationConfiguration.AccessRoleArn when creating each PR's App Runner service."
  value       = aws_iam_role.apprunner_ecr_access.arn
}
