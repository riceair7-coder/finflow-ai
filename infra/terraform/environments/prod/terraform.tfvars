environment       = "prod"
aws_region        = "ap-northeast-2"
app_name          = "finflow"

vpc_cidr           = "10.0.0.0/16"
availability_zones = ["ap-northeast-2a", "ap-northeast-2c"]

db_instance_class = "db.t3.medium"
redis_node_type   = "cache.t3.small"
api_desired_count = 2

# CI/CD에서 주입됨
api_image       = "REPLACE_WITH_ECR_URI"
ai_engine_image = "REPLACE_WITH_ECR_URI"
certificate_arn = ""   # ACM ARN 입력
