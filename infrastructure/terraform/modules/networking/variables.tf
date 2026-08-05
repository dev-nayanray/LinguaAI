variable "name" {
  description = "Name prefix for all networking resources (e.g. \"linguaai-staging\")."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones to spread subnets across. DEPLOYMENT.md §1: Multi-AZ is the baseline resilience posture."
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones are required for Multi-AZ resilience."
  }
}

variable "single_nat_gateway" {
  description = "Use one NAT gateway for all private subnets instead of one per AZ — a deliberate cost/resilience tradeoff for lower-traffic environments (e.g. staging). Production should set this false."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
