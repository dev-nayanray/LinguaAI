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

  name                 = "linguaai-example"
  github_repository    = "linguaai/linguaai"
  allowed_environments = ["staging", "production", "preview"]

  tags = {
    Project     = "linguaai"
    Environment = "example"
    ManagedBy   = "terraform"
  }
}
