output "alb_dns_name" {
  value = module.edge.alb_dns_name
}

output "cloudfront_domain_name" {
  value = module.edge.cloudfront_domain_name
}

output "db_cluster_endpoint" {
  value = module.data.db_cluster_endpoint
}

output "redis_primary_endpoint" {
  value = module.data.redis_primary_endpoint
}

output "ecs_cluster_name" {
  value = module.compute.cluster_name
}
