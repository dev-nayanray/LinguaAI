locals {
  name = "linguaai-production"

  tags = {
    Project     = "linguaai"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

module "state_backend" {
  source = "../../modules/state-backend"

  providers = {
    aws         = aws
    aws.replica = aws.state_replica
  }

  bucket_name         = "linguaai-terraform-state-production"
  replica_bucket_name = "linguaai-terraform-state-production-replica"
  lock_table_name     = "linguaai-terraform-lock-production"
  tags                = local.tags
}

module "networking" {
  source = "../../modules/networking"

  name               = local.name
  availability_zones = var.availability_zones
  single_nat_gateway = false # production: one NAT per AZ, no shared-failure-domain tradeoff (contrast staging)
  tags               = local.tags
}

module "data" {
  source = "../../modules/data"

  name               = local.name
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  db_instance_count  = 3 # writer + 2 Multi-AZ readers, one per AZ
  media_bucket_name  = "linguaai-production-media"
  backup_bucket_name = "linguaai-production-backup"
  tags               = local.tags
}

module "compute" {
  source = "../../modules/compute"

  name                  = local.name
  vpc_id                = module.networking.vpc_id
  private_subnet_ids    = module.networking.private_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  image_tag             = var.image_tag
  sentry_dsn_secret_arn = var.sentry_dsn_secret_arn
  db_master_secret_arn  = module.data.db_master_secret_arn
  tags                  = local.tags
}

module "edge" {
  source = "../../modules/edge"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name                  = local.name
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  target_group_arns     = module.compute.target_group_arns
  domain_name           = var.domain_name
  route53_zone_id       = var.route53_zone_id
  tags                  = local.tags
}

module "budget" {
  source = "../../modules/budget"

  name              = local.name
  monthly_limit_usd = 2000 # production placeholder, higher than staging — DEPLOYMENT.md §6.1, revisited with real usage data
  alert_emails      = var.budget_alert_emails
  tags              = local.tags
}
