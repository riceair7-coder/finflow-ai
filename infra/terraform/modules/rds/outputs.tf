output "endpoint"   { value = aws_db_instance.main.address, sensitive = true }
output "secret_arn" { value = aws_secretsmanager_secret.db.arn }
output "rds_sg_id"  { value = aws_security_group.rds.id }
