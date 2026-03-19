resource "aws_ecr_repository" "api" {
  name                 = "${var.app_name}-${var.environment}-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}

resource "aws_ecr_repository" "ai_engine" {
  name                 = "${var.app_name}-${var.environment}-ai-engine"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}

# 30일 이상 된 이미지 자동 정리
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "ai_engine" {
  repository = aws_ecr_repository.ai_engine.name
  policy     = aws_ecr_lifecycle_policy.api.policy
}
