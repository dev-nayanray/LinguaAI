output "cluster_id" {
  value = aws_ecs_cluster.this.id
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "target_group_arns" {
  description = "Map of service name -> ALB target group ARN, consumed by the edge module's listener rules."
  value       = { for k, v in aws_lb_target_group.service : k => v.arn }
}

output "service_security_group_ids" {
  value = { for k, v in aws_security_group.service : k => v.id }
}

output "ecr_repository_urls" {
  description = "Map of service name -> ECR repository URL, consumed by deploy-staging.yml/deploy-production.yml (T23) to know where to push each image."
  value       = { for k, v in aws_ecr_repository.this : k => v.repository_url }
}

output "ecs_service_names" {
  description = "Map of service name -> ECS service name, consumed by deploy workflows to target `aws ecs update-service` / wait-for-stable checks."
  value       = { for k, v in aws_ecs_service.this : k => v.name }
}
