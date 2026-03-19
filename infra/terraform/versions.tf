terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  backend "s3" {
    # 실제 배포 시 tfvars 또는 CI 환경변수로 주입
    # bucket = "finflow-terraform-state"
    # key    = "prod/terraform.tfstate"
    # region = "ap-northeast-2"
    # dynamodb_table = "finflow-terraform-locks"
    # encrypt = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "finflow-ai"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
