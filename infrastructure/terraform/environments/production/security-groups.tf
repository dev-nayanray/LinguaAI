# See environments/staging/security-groups.tf for why these live at the
# root instead of inside modules/data (avoiding a data <-> compute module
# dependency cycle).

resource "aws_security_group_rule" "db_ingress_from_services" {
  for_each = module.compute.service_security_group_ids

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = module.data.db_security_group_id
  source_security_group_id = each.value
}

resource "aws_security_group_rule" "redis_ingress_from_services" {
  for_each = module.compute.service_security_group_ids

  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = module.data.redis_security_group_id
  source_security_group_id = each.value
}
