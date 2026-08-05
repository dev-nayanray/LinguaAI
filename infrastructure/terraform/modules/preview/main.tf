# T24 / DEPLOYMENT.md §1: per-PR ephemeral preview environments for
# apps/web and apps/admin — the two apps reviewers actually look at for
# design/QA review (IMPLEMENTATION_GUIDE.md §3 Frontend Gate). Backend
# services have no UI to preview and no real business logic yet in E1;
# standing up the full VPC/RDS/ECS topology per open PR would be slow
# and expensive for what E1 Part 10 itself calls a non-blocking
# "convenience gate," so this is deliberately scoped to web/admin only.
#
# AWS App Runner, not ECS — a per-PR ECS service would need its own ALB
# listener rule/target group churn on every PR open/close, on top of the
# already-provisioned staging VPC/ALB. App Runner is a fully-managed,
# no-VPC-required "give it an image, get an HTTPS URL" service, which
# matches "ephemeral, cheap, fast to create and destroy" far better than
# reusing the staging environment's own load-balanced topology.
#
# Account-level, applied once — like modules/state-backend and
# modules/github-oidc, not duplicated per environment.

# App Runner needs its own IAM role to pull a private ECR image at
# deploy time (distinct from the GitHub Actions deploy role in
# modules/github-oidc) — AuthenticationConfiguration.AccessRoleArn in
# the `aws apprunner create-service` call preview.yml (T24) makes.
resource "aws_iam_role" "apprunner_ecr_access" {
  name = "${var.name}-apprunner-ecr-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}
