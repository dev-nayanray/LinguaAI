variable "name" {
  description = "Name prefix for all edge resources (e.g. \"linguaai-staging\")."
  type        = string
}

variable "vpc_id" {
  description = "VPC the ALB lives in (from the networking module)."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets the ALB spans (from the networking module)."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "ALB security group (from the networking module — shared with compute so neither module depends on the other)."
  type        = string
}

variable "domain_name" {
  description = "Primary domain name served by CloudFront/Route53 (e.g. \"staging.linguaai.com\"). Route53/ACM resources are only created when this is non-empty — a skeleton environment can plan without owning a real domain yet."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Existing Route53 hosted zone ID to create DNS records in. Required only when domain_name is set."
  type        = string
  default     = ""
}

variable "target_group_arns" {
  description = "Map of service name -> ALB target group ARN (from the compute module)."
  type        = map(string)
}

variable "public_services" {
  description = "Service names routed publicly through CloudFront (typically apps/web, apps/admin)."
  type        = list(string)
  default     = ["web", "admin"]
}

variable "default_service" {
  description = "Service name the ALB's default listener rule forwards to when no other rule matches."
  type        = string
  default     = "web"
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
