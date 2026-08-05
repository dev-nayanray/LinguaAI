# --- Aurora PostgreSQL (Multi-AZ, pgvector-capable) ---
# DEPLOYMENT.md §1: "RDS (Aurora PostgreSQL, Multi-AZ) — primary datastore
# + pgvector". pgvector itself is enabled per-database via
# `CREATE EXTENSION vector` (a migration concern, DATABASE.md), not a
# Terraform-managed resource.

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "Aurora PostgreSQL cluster — access restricted to compute-module security groups"
  vpc_id      = var.vpc_id
  tags        = var.tags
}

resource "aws_security_group_rule" "db_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.db.id
}

resource "random_password" "db_master" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_master" {
  name = "${var.name}-db-master-credentials"
  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "db_master" {
  secret_id = aws_secretsmanager_secret.db_master.id
  secret_string = jsonencode({
    username = var.db_master_username
    password = random_password.db_master.result
  })
}

resource "aws_rds_cluster" "this" {
  cluster_identifier     = var.name
  engine                 = "aurora-postgresql"
  engine_version         = var.db_engine_version
  database_name          = var.db_name
  master_username        = var.db_master_username
  master_password        = random_password.db_master.result
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]

  storage_encrypted = true

  # E1 Part 8 / DEPLOYMENT.md §6: point-in-time recovery + 7-day backup
  # retention, enabled by default from the data module's first creation.
  # For Aurora, PITR capability is intrinsic to backup_retention_period > 0
  # — there is no separate PITR toggle the way DynamoDB has one.
  backup_retention_period      = var.db_backup_retention_period
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "mon:04:30-mon:05:30"

  copy_tags_to_snapshot     = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-final"

  tags = var.tags
}

# Multi-AZ (DEPLOYMENT.md §1): instances spread across the private
# subnets' availability zones by RDS automatically based on the subnet
# group; db_instance_count >= 2 (enforced in variables.tf) gives at least
# one Multi-AZ reader alongside the writer.
resource "aws_rds_cluster_instance" "this" {
  count = var.db_instance_count

  identifier         = "${var.name}-${count.index}"
  cluster_identifier = aws_rds_cluster.this.id
  instance_class     = var.db_instance_class
  engine             = aws_rds_cluster.this.engine
  engine_version     = aws_rds_cluster.this.engine_version

  tags = var.tags
}

# --- ElastiCache Redis (cache, sessions, BullMQ — DEPLOYMENT.md §1) ---

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name}-redis"
  subnet_ids = var.private_subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "redis" {
  name        = "${var.name}-redis"
  description = "ElastiCache Redis — access restricted to compute-module security groups"
  vpc_id      = var.vpc_id
  tags        = var.tags
}

resource "aws_security_group_rule" "redis_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.redis.id
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.name
  description          = "${var.name} — cache, sessions, BullMQ (DEPLOYMENT.md §1)"

  engine             = "redis"
  node_type          = var.redis_node_type
  num_cache_clusters = var.redis_num_cache_clusters

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = var.redis_num_cache_clusters > 1
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = var.tags
}

# --- S3 (media, backups — DEPLOYMENT.md §1, §6) ---

resource "aws_s3_bucket" "media" {
  bucket = var.media_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "backup" {
  bucket = var.backup_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DEPLOYMENT.md §6.1 / §6: lifecycle policies for cost-managed long-term
# retention on backup content.
resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    id     = "backup-archival"
    status = "Enabled"

    filter {}

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}
