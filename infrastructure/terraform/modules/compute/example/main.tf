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

module "this" {
  source = "../"

  name                  = "linguaai-example"
  vpc_id                = "vpc-00000000000000000"
  private_subnet_ids    = ["subnet-00000000000000001", "subnet-00000000000000002"]
  alb_security_group_id = "sg-00000000000000001"
  image_tag             = "example"
  sentry_dsn_secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:linguaai-example-sentry-dsn-abcdef"
  db_master_secret_arn  = "arn:aws:secretsmanager:us-east-1:111111111111:secret:linguaai-example-db-master-credentials-abcdef"

  tags = {
    Project     = "linguaai"
    Environment = "example"
    ManagedBy   = "terraform"
  }
}
