# Offline-safe provider configuration (E1 T18): `skip_*` flags let
# `terraform plan` succeed without real AWS credentials or network access
# — DEPLOYMENT.md §3 requires every module's plan to succeed in isolation,
# not that a real AWS account be reachable to prove it.
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
  s3_use_path_style           = true
}

# nosemgrep: terraform.aws.security.aws-provider-static-credentials.aws-provider-static-credentials
provider "aws" {
  alias                       = "replica"
  region                      = "us-west-2"
  access_key                  = "test"
  secret_key                  = "test" # nosemgrep: terraform.aws.security.aws-provider-static-credentials.aws-provider-static-credentials
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
}

module "this" {
  source = "../"

  providers = {
    aws         = aws
    aws.replica = aws.replica
  }

  bucket_name         = "linguaai-terraform-state-example"
  replica_bucket_name = "linguaai-terraform-state-example-replica"
  lock_table_name     = "linguaai-terraform-lock-example"

  tags = {
    Project     = "linguaai"
    Environment = "example"
    ManagedBy   = "terraform"
  }
}
