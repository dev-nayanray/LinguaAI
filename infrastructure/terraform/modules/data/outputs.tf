output "db_cluster_endpoint" {
  value = aws_rds_cluster.this.endpoint
}

output "db_cluster_reader_endpoint" {
  value = aws_rds_cluster.this.reader_endpoint
}

output "db_security_group_id" {
  value = aws_security_group.db.id
}

output "db_master_secret_arn" {
  value = aws_secretsmanager_secret.db_master.arn
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "redis_security_group_id" {
  value = aws_security_group.redis.id
}

output "media_bucket_name" {
  value = aws_s3_bucket.media.bucket
}

output "backup_bucket_name" {
  value = aws_s3_bucket.backup.bucket
}
