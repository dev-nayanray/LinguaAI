variable "bucket_name" {
  description = "Name of the primary Terraform state bucket."
  type        = string
}

variable "replica_bucket_name" {
  description = "Name of the cross-region replica bucket for the state bucket."
  type        = string
}

variable "lock_table_name" {
  description = "Name of the DynamoDB table used for Terraform state locking."
  type        = string
  default     = "terraform-state-lock"
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
