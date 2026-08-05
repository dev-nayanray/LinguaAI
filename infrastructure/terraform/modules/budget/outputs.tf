output "budget_id" {
  value = aws_budgets_budget.monthly.id
}

output "sns_topic_arn" {
  value = aws_sns_topic.budget_alert.arn
}
