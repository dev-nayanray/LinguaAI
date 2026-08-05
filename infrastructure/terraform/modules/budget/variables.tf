variable "name" {
  description = "Name prefix for budget resources (e.g. \"linguaai-staging\")."
  type        = string
}

variable "monthly_limit_usd" {
  description = "Monthly cost budget in USD. E1 Part 8 / Risk #15: uncontrolled AWS spend before real usage exists is a named risk this alert exists to catch early — this is a placeholder threshold, revisited once real traffic/cost data exists."
  type        = number
  default     = 500
}

variable "alert_thresholds_percent" {
  description = "Percent-of-budget thresholds that each trigger a separate alert (actual spend, not forecast)."
  type        = list(number)
  default     = [50, 80, 100]
}

variable "alert_emails" {
  description = "Email addresses subscribed to budget alert notifications."
  type        = list(string)
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
