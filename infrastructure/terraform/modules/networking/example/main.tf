# nosemgrep: terraform.aws.security.aws-provider-static-credentials.aws-provider-static-credentials
# Not a real credential — "test" plus skip_credentials_validation lets
# `terraform plan` succeed offline against this module in isolation (T18
# acceptance criteria), and this example/ config is never applied.
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
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]

  tags = {
    Project     = "linguaai"
    Environment = "example"
    ManagedBy   = "terraform"
  }
}
