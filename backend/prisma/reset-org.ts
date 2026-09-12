import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "123456";

const NUEVAS_UBICACIONES = [
  { name: "TUMUSLA", type: "TIENDA" as const },
  { name: "SILES", type: "TIENDA" as const },
  { name: "FALSURI", type: "TIENDA" as const },
  { name: "MELCHOR", type: "ALMACEN" as const },
  { name: "QUIJARRO", type: "ALMACEN" as const },
  { name: "CHIQUICOLLO", type: "ALMACEN" as const },
];

const NUEVOS_USUARIOS = [
  { name: "Valeria Zubieta", email: "valeria.zubieta@valeria.com", role: "ADMIN", location: null as string | null },
  { name: "Daniel Zubieta", email: "daniel.zubieta@valeria.com", role: "ADMIN", location: null as string | null },
  { name: "Alvaro Morales", email: "alvaro.morales@valeria.com", role: "INVENTARIO", location: "MELCHOR" },
  { name: "Luis Mamani", email: "luis.mamani@valeria.com", role: "INVENTARIO", location: "QUIJARRO" },
  { name: "Sergio Flores", email: "sergio.flores@valeria.com", role: "INVENTARIO", location: "CHIQUICOLLO" },
  { name: "Liz Zubieta", email: "liz.zubieta@valeria.com", role: "TIENDA", location: "SILES" },
  { name: "Navel Zubieta", email: "navel.zubieta@valeria.com", role: "TIENDA", location: "FALSURI" },
  { name: "Papachu Zubieta", email: "papachu@gmail.com", role: "TIENDA", location: "TUMUSLA" },
  { name: "Adrian Montero", email: "adrian.montero@valeria.com", role: "TIENDA", location: "TUMUSLA" },
  { name: "Jessica Lia", email: "jessica.lia@valeria.com", role: "TIENDA", location: "TUMUSLA" },
];

async function main() {
  // 1) Borrado atómico de datos transaccionales + usuarios + ubicaciones
  const deleted = await prisma.$transaction([
    prisma.notification.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.requestHistory.deleteMany({}),
    prisma.movement.deleteMany({}),
    prisma.return.deleteMany({}),
    prisma.payment.deleteMany({}),
    prisma.saleItem.deleteMany({}),
    prisma.sale.deleteMany({}),
    prisma.productRequest.deleteMany({}),
    prisma.purchaseNoteItem.deleteMany({}),
    prisma.purchaseNote.deleteMany({}),
    prisma.cost.deleteMany({}),
    prisma.inventory.deleteMany({}),
    prisma.user.deleteMany({}),
    prisma.location.deleteMany({}),
  ]);

  // 2) Creación idempotente de ubicaciones
  const locByName = new Map<string, number>();
  for (const u of NUEVAS_UBICACIONES) {
    const existente = await prisma.location.findFirst({ where: { name: u.name } });
    const loc = existente
      ? await prisma.location.update({ where: { id: existente.id }, data: { type: u.type } })
      : await prisma.location.create({ data: u });
    locByName.set(u.name, loc.id);
  }

  // 3) Creación/actualización idempotente de usuarios
  const roles = await prisma.roleModel.findMany({});
  const pass = await bcrypt.hash(PASSWORD, 10);
  for (const user of NUEVOS_USUARIOS) {
    const role = roles.find((r) => r.name === user.role);
    if (!role) throw new Error(`Rol no encontrado: ${user.role}`);
    const locationId = user.location ? locByName.get(user.location) ?? null : null;
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, roleId: role.id, locationId },
      create: { name: user.name, email: user.email, password: pass, roleId: role.id, locationId },
    });
  }

  console.log("=== Reset completado ===");
  console.log("Datos eliminados:", JSON.stringify(deleted, null, 2));
  console.log("Ubicaciones:", NUEVAS_UBICACIONES.map((u) => `${u.name}(${u.type})`).join(", "));
  console.log("Usuarios:");
  for (const u of NUEVOS_USUARIOS) {
    console.log(`  ${u.name} | ${u.email} | ${u.role} | ${u.location || "-"} | pw: ${PASSWORD}`);
  }
}

main()
  .catch((e) => {
    console.error("Error en reset:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());