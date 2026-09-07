param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

# Aplica todas las migraciones y siembra los datos de prueba en la base remota.
# Uso:  .\scripts\deploy-db.ps1 "postgresql://usuario:pass@host:puerto/db?sslmode=require"

$env:DATABASE_URL = $DatabaseUrl
$env:NODE_ENV = "production"

$migrations = @(
  "prisma/migrations/20260819182416_init/migration.sql",
  "prisma/migrations/20260820163545_add_quality_importers/migration.sql",
  "prisma/migrations/20260902_add_movement_request_id/migration.sql",
  "prisma/migrations/20260902130000_add_unique_nit/migration.sql",
  "prisma/migrations/add_seller_columnPrefs.sql",
  "prisma/migrations/add_role_columnConfig.sql",
  "prisma/migrations/add_schema_sync.sql",
  "prisma/migrations/add_wholesale_order_fields.sql",
  "prisma/migrations/add_product_images.sql",
  "prisma/migrations/add_purchase_notes.sql"
)

Write-Host "== Generando Prisma Client =="
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit 1 }

foreach ($m in $migrations) {
  Write-Host "== Aplicando $m =="
  npx prisma db execute --file $m --schema prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { Write-Host "ERROR en $m" -ForegroundColor Red; exit 1 }
}

Write-Host "== Sembrando datos de prueba (admin@inventario.com / admin123) =="
npm run prisma:seed
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`nBase de datos lista." -ForegroundColor Green