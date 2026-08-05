resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

# One ECR repository per service (T23 fix — nothing in T18's original
# design actually provisioned these, leaving deploy-staging.yml/
# deploy-production.yml with nowhere to push images to). Image scanning
# on push complements, not replaces, the security-scan.yml/T20 Trivy
# scan — this catches anything pushed outside that PR-time gate too.
resource "aws_ecr_repository" "this" {
  for_each = var.services

  name                 = "${var.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE" # DEPLOYMENT.md §2: deployments reference immutable Git-SHA tags, never :latest

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}

# Expire untagged images (failed/superseded pushes) after 7 days — real
# tagged images (Git SHAs) are kept indefinitely since DEPLOYMENT.md's
# release model is "promote a specific SHA from staging to production,"
# which means a production deploy can reference an image pushed well
# before the current retention window of a naive "keep last N" policy.
resource "aws_ecr_lifecycle_policy" "this" {
  for_each = var.services

  repository = aws_ecr_repository.this[each.key].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after 7 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 7
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "this" {
  for_each = var.services

  name              = "/ecs/${var.name}/${each.key}"
  retention_in_days = 30
  tags              = var.tags
}

# Execution role — pulls images from ECR, writes to CloudWatch, reads the
# secrets referenced in each task definition's `secrets` block.
# DEPLOYMENT.md §7: secrets are injected from Secrets Manager at deploy
# time, never baked into an image layer.
resource "aws_iam_role" "execution" {
  name = "${var.name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "${var.name}-ecs-execution-secrets"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [var.sentry_dsn_secret_arn, var.db_master_secret_arn]
    }]
  })
}

# Task role — the application's own AWS SDK permissions at runtime. Empty
# by default in E1 (no product logic needing AWS APIs yet); later Epics
# attach service-specific policies as they add real AWS integrations.
resource "aws_iam_role" "task" {
  name = "${var.name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

# ADOT Collector sidecar needs to reach AWS X-Ray/CloudWatch APIs.
resource "aws_iam_role_policy_attachment" "task_adot" {
  role       = aws_iam_role.task.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy_attachment" "task_adot_cloudwatch" {
  role       = aws_iam_role.task.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_security_group" "service" {
  for_each = var.services

  name        = "${var.name}-${each.key}"
  description = "${each.key} ECS service — ingress restricted to the ALB security group"
  vpc_id      = var.vpc_id
  tags        = var.tags
}

resource "aws_security_group_rule" "service_ingress_alb" {
  for_each = var.services

  type                     = "ingress"
  from_port                = each.value.container_port
  to_port                  = each.value.container_port
  protocol                 = "tcp"
  security_group_id        = aws_security_group.service[each.key].id
  source_security_group_id = var.alb_security_group_id
}

resource "aws_security_group_rule" "service_egress" {
  for_each = var.services

  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.service[each.key].id
}

resource "aws_lb_target_group" "service" {
  for_each = var.services

  # AWS caps target group names at 32 characters — "<env>-<service>" blows
  # past that for real names like "linguaai-staging-recommendation-engine"
  # (38 chars), a limit the module's own short-named example/ never
  # exercised. name_prefix (AWS's own escape hatch, max 6 chars, random
  # suffix appended) sidesteps hand-rolled truncation/hashing entirely;
  # the full name is still available via the Name tag.
  name_prefix = "tg-"
  port        = each.value.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  lifecycle {
    create_before_destroy = true
  }

  health_check {
    path                = each.value.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  tags = merge(var.tags, {
    Name = "${var.name}-${each.key}"
  })
}

# Task definitions — one app container + one ADOT Collector sidecar per
# task (E1 Part 8 / OBSERVABILITY.md §3): every skeleton service exposes
# logs/metrics/traces from its first deployment, wired here rather than
# bolted on per-service later. Hardening mirrors the T17 Dockerfiles:
# read-only root filesystem, dropped Linux capabilities, explicit
# CPU/memory limits at both the task and container level (Risk #9/R-30).
resource "aws_ecs_task_definition" "service" {
  for_each = var.services

  family                   = "${var.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(each.value.cpu)
  memory                   = tostring(each.value.memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${aws_ecr_repository.this[each.key].repository_url}:${var.image_tag}"
      essential = true

      portMappings = [{
        containerPort = each.value.container_port
        protocol      = "tcp"
      }]

      cpu    = each.value.container_cpu
      memory = each.value.container_memory

      readonlyRootFilesystem = true
      linuxParameters = {
        capabilities = { drop = ["ALL"] }
        # Next.js apps (web/admin) get a small tmpfs for .next/cache —
        # documented as a recommendation, not a hard requirement, in
        # infrastructure/docker/{web,admin}/Dockerfile (T17): the app
        # falls back to in-memory caching without it. NestJS services do
        # no filesystem writes at runtime and need none.
        tmpfs = each.value.is_public ? [{
          containerPath = "/app/apps/${each.key}/.next/cache"
          size          = 128
        }] : []
      }

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(each.value.container_port) },
      ]

      secrets = [
        { name = "SENTRY_DSN", valueFrom = var.sentry_dsn_secret_arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this[each.key].name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = each.key
        }
      }
    },
    {
      name      = "adot-collector"
      image     = var.otel_collector_image
      essential = false

      cpu    = max(each.value.cpu - each.value.container_cpu, 128)
      memory = max(each.value.memory - each.value.container_memory, 256)

      readonlyRootFilesystem = false # the collector writes its own runtime state
      linuxParameters = {
        capabilities = { drop = ["ALL"] }
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this[each.key].name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "adot"
        }
      }
    }
  ])

  tags = var.tags
}

resource "aws_ecs_service" "this" {
  for_each = var.services

  name            = "${var.name}-${each.key}"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = each.value.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.service[each.key].id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.service[each.key].arn
    container_name   = each.key
    container_port   = each.value.container_port
  }

  # DEPLOYMENT.md §4: "automatic rollback on failed health checks"
  # (T23 fix — nothing in T18's original design actually enabled this).
  # ECS's native deployment circuit breaker rolls the service back to its
  # previous task definition if the new one never reaches a healthy
  # steady state, rather than leaving a broken deployment running.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = var.tags
}

data "aws_region" "current" {}
