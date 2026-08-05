# Cross-module ingress rules — data's DB/Redis security groups need
# compute's ECS service security groups as a source, and compute needs
# data's Secrets Manager ARN for DB credentials. Wiring both directions
# inside either module would create a module dependency cycle (see
# modules/data/variables.tf), so these rules live here at the root, where
# both modules' outputs are already resolved.

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
