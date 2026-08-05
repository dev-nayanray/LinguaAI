variable "name" {
  description = "Name prefix for all data-layer resources (e.g. \"linguaai-staging\")."
  type        = string
}

variable "vpc_id" {
  description = "VPC to place data resources in (from the networking module)."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs the RDS/ElastiCache subnet groups span (from the networking module)."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets are required for Multi-AZ RDS/ElastiCache."
  }
}

# No `allowed_security_group_ids` input here: the compute module's ECS
# task security groups aren't available without depending on the compute
# module's output — and compute's task definitions need this module's
# db_master_secret_arn output, which would make data <-> compute a cycle.
# Cross-module ingress rules (data's DB/Redis SGs <- compute's service
# SGs) are wired at the environment root instead, where both modules'
# outputs are already resolved. See environments/staging/main.tf.

variable "db_name" {
  description = "Initial database name on the Aurora PostgreSQL cluster."
  type        = string
  default     = "linguaai"
}

variable "db_master_username" {
  description = "Master username for the Aurora PostgreSQL cluster."
  type        = string
  default     = "linguaai_admin"
}

variable "db_engine_version" {
  description = "Aurora PostgreSQL engine version. Must support the pgvector extension (DEPLOYMENT.md §1) — 15.3+."
  type        = string
  default     = "15.10"
}

variable "db_instance_class" {
  description = "Instance class for each Aurora cluster instance."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_instance_count" {
  description = "Number of Aurora cluster instances — DEPLOYMENT.md §1 requires Multi-AZ, so this must be >= 2 (writer + at least one Multi-AZ reader)."
  type        = number
  default     = 2

  validation {
    condition     = var.db_instance_count >= 2
    error_message = "At least 2 instances are required for Multi-AZ (DEPLOYMENT.md §1)."
  }
}

variable "db_backup_retention_period" {
  description = <<-EOT
    Backup retention in days. E1 Part 8 / DEPLOYMENT.md §6 requires point-in-time
    recovery + a 7-day default retention from the data module's first creation.
    For RDS/Aurora, PITR is not a separate toggle — it is enabled precisely when
    backup_retention_period > 0, and 7 is the minimum this Epic requires.
  EOT
  type        = number
  default     = 7

  validation {
    condition     = var.db_backup_retention_period >= 7
    error_message = "DEPLOYMENT.md §6 / E1 Part 8 require at least a 7-day backup retention default."
  }
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t4g.small"
}

variable "redis_num_cache_clusters" {
  description = "Number of cache clusters in the Redis replication group (1 primary + N-1 replicas)."
  type        = number
  default     = 2
}

variable "media_bucket_name" {
  description = "S3 bucket name for media, audio, and generated content."
  type        = string
}

variable "backup_bucket_name" {
  description = "S3 bucket name for application-level backups."
  type        = string
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
