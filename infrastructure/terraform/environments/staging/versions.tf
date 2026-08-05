terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # DEPLOYMENT.md §3: state stored remotely (S3 + DynamoDB lock), never
  # local. Bucket/table names match modules/state-backend's naming
  # convention for the staging environment — see README.md "Why
  # environments/* can't be terraform init'd here" for the bootstrap
  # order-of-operations this implies.
  backend "s3" {
    bucket         = "linguaai-terraform-state-staging"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "linguaai-terraform-lock-staging"
    encrypt        = true
  }
}
