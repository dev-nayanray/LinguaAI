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

  name               = "linguaai-example"
  vpc_id             = "vpc-00000000000000000"
  private_subnet_ids = ["subnet-00000000000000001", "subnet-00000000000000002"]
  media_bucket_name  = "linguaai-example-media"
  backup_bucket_name = "linguaai-example-backup"

  tags = {
    Project     = "linguaai"
    Environment = "example"
    ManagedBy   = "terraform"
  }
}
