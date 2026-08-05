# E1 Part 8 / Part 14 (Risk #15): "uncontrolled AWS spend" was named as a
# risk with a mitigation but no task actually tied to it until the E1
# review caught this — this module is that task's concrete output.

resource "aws_sns_topic" "budget_alert" {
  name = "${var.name}-budget-alert"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "budget_alert_email" {
  for_each = toset(var.alert_emails)

  topic_arn = aws_sns_topic.budget_alert.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = var.alert_thresholds_percent

    content {
      comparison_operator       = "GREATER_THAN"
      threshold                 = notification.value
      threshold_type            = "PERCENTAGE"
      notification_type         = "ACTUAL"
      subscriber_sns_topic_arns = [aws_sns_topic.budget_alert.arn]
    }
  }
}
