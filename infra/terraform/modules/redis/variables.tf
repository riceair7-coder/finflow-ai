variable "app_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnets" { type = list(string) }
variable "node_type" { type = string }
variable "ecs_sg_id" { type = string }
