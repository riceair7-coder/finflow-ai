module "vpc" {
  source             = "./modules/vpc"
  app_name           = var.app_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

module "ecr" {
  source      = "./modules/ecr"
  app_name    = var.app_name
  environment = var.environment
}

module "alb" {
  source          = "./modules/alb"
  app_name        = var.app_name
  environment     = var.environment
  vpc_id          = module.vpc.vpc_id
  public_subnets  = module.vpc.public_subnet_ids
  certificate_arn = var.certificate_arn
}

module "rds" {
  source           = "./modules/rds"
  app_name         = var.app_name
  environment      = var.environment
  vpc_id           = module.vpc.vpc_id
  private_subnets  = module.vpc.private_subnet_ids
  db_name          = var.db_name
  instance_class   = var.db_instance_class
  ecs_sg_id        = module.ecs.ecs_sg_id
}

module "redis" {
  source          = "./modules/redis"
  app_name        = var.app_name
  environment     = var.environment
  vpc_id          = module.vpc.vpc_id
  private_subnets = module.vpc.private_subnet_ids
  node_type       = var.redis_node_type
  ecs_sg_id       = module.ecs.ecs_sg_id
}

module "ecs" {
  source             = "./modules/ecs"
  app_name           = var.app_name
  environment        = var.environment
  aws_region         = var.aws_region
  vpc_id             = module.vpc.vpc_id
  private_subnets    = module.vpc.private_subnet_ids
  alb_target_group_arn = module.alb.api_target_group_arn
  api_image          = var.api_image
  ai_engine_image    = var.ai_engine_image
  api_desired_count  = var.api_desired_count
  db_secret_arn      = module.rds.secret_arn
  redis_endpoint     = module.redis.endpoint
}
