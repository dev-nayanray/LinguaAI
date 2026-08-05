output "bucket_name" {
  value = aws_s3_bucket.state.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.state.arn
}

output "replica_bucket_name" {
  value = aws_s3_bucket.state_replica.bucket
}

output "lock_table_name" {
  value = aws_dynamodb_table.lock.name
}
