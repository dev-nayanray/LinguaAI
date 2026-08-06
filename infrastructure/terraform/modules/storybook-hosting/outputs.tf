output "s3_bucket_name" {
  description = "Bucket preview.yml uploads each PR's Storybook build to, under a \"pr-<number>/\" key prefix."
  value       = aws_s3_bucket.storybook.id
}

output "cloudfront_distribution_id" {
  description = "Distribution ID preview.yml invalidates after each upload."
  value       = aws_cloudfront_distribution.storybook.id
}

output "cloudfront_domain_name" {
  description = "Base domain every PR's preview URL is built from: https://<this>/pr-<number>/."
  value       = aws_cloudfront_distribution.storybook.domain_name
}
