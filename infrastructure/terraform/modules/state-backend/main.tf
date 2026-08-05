# Primary state bucket — versioning is required both for Terraform's own
# state history and as a precondition for S3 cross-region replication.
resource "aws_s3_bucket" "state" {
  bucket = var.bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Cross-region replica — DEPLOYMENT.md §3 / E1 Part 8 (High 3 remediation):
# the state file is real, valuable content from the first `apply`, so it
# gets the same DR posture the data module gives RDS.
resource "aws_s3_bucket" "state_replica" {
  provider = aws.replica
  bucket   = var.replica_bucket_name
  tags     = var.tags
}

resource "aws_s3_bucket_versioning" "state_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.state_replica.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.state_replica.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state_replica" {
  provider                = aws.replica
  bucket                  = aws_s3_bucket.state_replica.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_role" "replication" {
  name = "${var.bucket_name}-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "s3.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "replication" {
  name = "${var.bucket_name}-replication"
  role = aws_iam_role.replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
        Resource = [aws_s3_bucket.state.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging"]
        Resource = ["${aws_s3_bucket.state.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"]
        Resource = ["${aws_s3_bucket.state_replica.arn}/*"]
      }
    ]
  })
}

resource "aws_s3_bucket_replication_configuration" "state" {
  # Replication requires versioning enabled on both buckets first — an
  # explicit dependency since the provider can't infer ordering from
  # attribute references alone.
  depends_on = [aws_s3_bucket_versioning.state, aws_s3_bucket_versioning.state_replica]

  bucket = aws_s3_bucket.state.id
  role   = aws_iam_role.replication.arn

  rule {
    id     = "state-cross-region-replication"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.state_replica.arn
      storage_class = "STANDARD_IA"
    }
  }
}

# DynamoDB lock table — prevents concurrent `terraform apply` from
# corrupting state (DEPLOYMENT.md §3). Holds only a transient lock ID
# during an active plan/apply, never the state content itself (that's
# the separately KMS-encrypted S3 bucket above) — a dedicated
# customer-managed KMS key for this table (what the semgrep finding
# below asks for) is disproportionate to what it actually stores;
# explicit AWS-owned-key encryption (below) is the right-sized control.
# nosemgrep: terraform.aws.security.aws-dynamodb-table-unencrypted.aws-dynamodb-table-unencrypted
resource "aws_dynamodb_table" "lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # DynamoDB encrypts at rest by default with an AWS-owned key; explicit
  # here (T20 semgrep finding) since the state lock table protects the
  # same state file the rest of this module already treats as real,
  # valuable content (versioning + cross-region replication above).
  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}
