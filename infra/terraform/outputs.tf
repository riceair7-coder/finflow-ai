output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.dns_name
}

output "ecr_api_url" {
  description = "ECR repository URL for API"
  value       = module.ecr.api_repository_url
}

output "ecr_ai_engine_url" {
  description = "ECR repository URL for AI engine"
  value       = module.ecr.ai_engine_repository_url
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache endpoint"
  value       = module.redis.endpoint
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}
