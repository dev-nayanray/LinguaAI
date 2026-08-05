terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Local backend deliberately — this example exists only to prove
  # `terraform plan` succeeds against the module in isolation (E1 T18
  # acceptance criteria), never to actually apply. Real environments use
  # the S3 remote backend configured in environments/*/backend.tf.
  backend "local" {}
}
