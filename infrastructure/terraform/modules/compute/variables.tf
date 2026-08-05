variable "name" {
  description = "Name prefix for all compute resources (e.g. \"linguaai-staging\")."
  type        = string
}

variable "vpc_id" {
  description = "VPC to place ECS tasks in (from the networking module)."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets ECS Fargate tasks run in (from the networking module)."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group of the ALB (from the edge module) — the only ingress source allowed to each service's container port."
  type        = string
}

variable "image_tag" {
  description = "Immutable image tag (Git SHA) to deploy — DEPLOYMENT.md §2: deployments reference immutable tags, never :latest in production."
  type        = string
}

variable "otel_collector_image" {
  description = "ADOT Collector sidecar image (OBSERVABILITY.md §3 / E1 Part 8 — one sidecar per ECS task, forwarding traces to X-Ray and logs/metrics to CloudWatch)."
  type        = string
  default     = "public.ecr.aws/aws-observability/aws-otel-collector:latest"
}

variable "sentry_dsn_secret_arn" {
  description = "Secrets Manager ARN holding the Sentry DSN (E1's one required observability secret — E1 Part 8)."
  type        = string
}

variable "db_master_secret_arn" {
  description = "Secrets Manager ARN holding Aurora master credentials (from the data module), injected into services that need direct DB access."
  type        = string
}

# Per-service task sizing and routing. Defaults cover all 8 E1 skeleton
# apps/services (DEPLOYMENT.md §1) with deliberately modest sizing for a
# skeleton with no product logic yet — real sizing is revisited once
# traffic data exists (DEPLOYMENT.md §6.1).
variable "services" {
  description = "Map of service name -> task/service configuration."
  type = map(object({
    container_port    = number
    health_check_path = string
    cpu               = number # task-level vCPU units (Fargate: 256 = 0.25 vCPU)
    memory            = number # task-level MiB
    container_cpu     = number # application container's share of task cpu
    container_memory  = number # application container's share of task memory
    desired_count     = number
    is_public         = bool # true only for apps/web, apps/admin (routed via CloudFront)
  }))

  default = {
    web = {
      container_port    = 3000
      health_check_path = "/"
      cpu               = 512
      memory            = 1024
      container_cpu     = 384
      container_memory  = 768
      desired_count     = 2
      is_public         = true
    }
    admin = {
      container_port    = 3001
      health_check_path = "/"
      cpu               = 512
      memory            = 1024
      container_cpu     = 384
      container_memory  = 768
      desired_count     = 2
      is_public         = true
    }
    api = {
      container_port    = 4000
      health_check_path = "/health"
      cpu               = 512
      memory            = 1024
      container_cpu     = 384
      container_memory  = 768
      desired_count     = 2
      is_public         = false
    }
    ai-engine = {
      container_port    = 4001
      health_check_path = "/health"
      cpu               = 512
      memory            = 1024
      container_cpu     = 384
      container_memory  = 768
      desired_count     = 2
      is_public         = false
    }
    speech-service = {
      container_port    = 4002
      health_check_path = "/health"
      cpu               = 512
      memory            = 1024
      container_cpu     = 384
      container_memory  = 768
      desired_count     = 2
      is_public         = false
    }
    recommendation-engine = {
      container_port    = 4003
      health_check_path = "/health"
      cpu               = 512
      memory            = 1024
      container_cpu     = 384
      container_memory  = 768
      desired_count     = 2
      is_public         = false
    }
    notification-service = {
      container_port    = 4004
      health_check_path = "/health"
      cpu               = 512
      memory            = 1024
      container_cpu     = 384
      container_memory  = 768
      desired_count     = 2
      is_public         = false
    }
    analytics-service = {
      container_port    = 4005
      health_check_path = "/health"
      cpu               = 512
      memory            = 1024
      container_cpu     = 384
      container_memory  = 768
      desired_count     = 2
      is_public         = false
    }
  }
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
