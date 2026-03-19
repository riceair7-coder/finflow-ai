variable "app_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "public_subnets" { type = list(string) }
variable "certificate_arn" { type = string, default = "" }
