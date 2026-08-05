# nosemgrep: terraform.aws.security.aws-provider-static-credentials.aws-provider-static-credentials
# Not a real credential — "test" plus skip_credentials_validation, and
# this example/ config is never applied (T20 semgrep finding).
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test" # nosemgrep: terraform.aws.security.aws-provider-static-credentials.aws-provider-static-credentials
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

# CloudFront/ACM resources are global but must be requested from
# us-east-1 regardless of the environment's primary region — a real AWS
# constraint, not a modeling choice. Aliased here even though this
# example uses the same region for both, so the module's provider
# contract matches what environments/* actually needs.
# nosemgrep: terraform.aws.security.aws-provider-static-credentials.aws-provider-static-credentials
provider "aws" {
  alias                       = "us_east_1"
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test" # nosemgrep: terraform.aws.security.aws-provider-static-credentials.aws-provider-static-credentials
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

module "this" {
  source = "../"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name                  = "linguaai-example"
  vpc_id                = "vpc-00000000000000000"
  public_subnet_ids     = ["subnet-00000000000000003", "subnet-00000000000000004"]
  alb_security_group_id = "sg-00000000000000001"

  target_group_arns = {
    web = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/linguaai-example-web/abc123"
    api = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/linguaai-example-api/def456"
  }

  tags = {
    Project     = "linguaai"
    Environment = "example"
    ManagedBy   = "terraform"
  }
}
