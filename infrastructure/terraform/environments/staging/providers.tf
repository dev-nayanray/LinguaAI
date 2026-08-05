provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}

# CloudFront/ACM resources must be requested from us-east-1 regardless of
# the environment's primary region (a real AWS constraint) — see
# modules/edge/versions.tf.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.tags
  }
}

# Cross-region replica target for the Terraform state bucket (E1 Part 8,
# High 3). Deliberately a distinct region from both the primary region
# and the us_east_1 alias above — replicating within the same region
# would defeat the point of cross-region DR.
provider "aws" {
  alias  = "state_replica"
  region = "us-west-2"

  default_tags {
    tags = local.tags
  }
}
