variable "name" {
  description = "Name prefix for preview-environment resources (e.g. \"linguaai\")."
  type        = string
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
