import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedData } from "./seed-data";

const prisma = new PrismaClient();

async function main() {
  console.log("Sembrando datos iniciales...");

  // Roles
  const adminRole = await prisma.roleModel.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN", permissions: ["*"] },
  });

  const tiendaRole = await prisma.roleModel.upsert({
    where: { name: "TIENDA" },
    update: {
      permissions: ["ventas", "inventario", "solicitudes", "devoluciones"],
      columnConfig: {
        inventario: ["ID", "Fabricante", "Producto", "Marca", "Modelo", "Año", "Detalles", "Cód. OEM", "Cód. Fábrica", "Imagen", "Precio 1", "Precio 2", "Stock", "Acciones"],
        ventas: ["ID", "Fecha", "Cliente", "Tienda", "Vendedor", "Total", "Estado", "Acciones"],
        __categorias: ["Frenos", "Motor", "Eléctrico"],
      },
    },
    create: {
      name: "TIENDA",
      permissions: ["ventas", "inventario", "solicitudes", "devoluciones"],
      columnConfig: {
        inventario: ["ID", "Fabricante", "Producto", "Marca", "Modelo", "Año", "Detalles", "Cód. OEM", "Cód. Fábrica", "Imagen", "Precio 1", "Precio 2", "Stock", "Acciones"],
        ventas: ["ID", "Fecha", "Cliente", "Tienda", "Vendedor", "Total", "Estado", "Acciones"],
        __categorias: ["Frenos", "Motor", "Eléctrico"],
      },
    },
  });

  const inventarioRole = await prisma.roleModel.upsert({
    where: { name: "INVENTARIO" },
    update: {},
    create: { name: "INVENTARIO", permissions: ["movimientos", "inventario", "solicitudes"] },
  });

  console.log("Roles creados:", { adminRole: adminRole.id, tiendaRole: tiendaRole.id, inventarioRole: inventarioRole.id });

  // Ubicaciones: 3 tiendas + 3 almacenes (FerCar)
  const ubicaciones = [
    { name: "TUMUSLA", type: "TIENDA" as const, address: null },
    { name: "SILES", type: "TIENDA" as const, address: null },
    { name: "FALSURI", type: "TIENDA" as const, address: null },
    { name: "MELCHOR", type: "ALMACEN" as const, address: null },
    { name: "QUIJARRO", type: "ALMACEN" as const, address: null },
    { name: "CHIQUICOLLO", type: "ALMACEN" as const, address: null },
  ];

  const ubicacionesCreadas = [];
  for (const u of ubicaciones) {
    const existente = await prisma.location.findFirst({ where: { name: u.name } });
    const ubicacion = existente
      ? await prisma.location.update({ where: { id: existente.id }, data: { type: u.type, address: u.address } })
      : await prisma.location.create({ data: u });
    ubicacionesCreadas.push(ubicacion);
  }

  console.log("Ubicaciones creadas:", ubicacionesCreadas.length);

  // Categorías iniciales
  const categorias = ["Frenos", "Motor", "Suspensión", "Eléctrico", "Carrocería", "Transmisión", "Filtros"];
  for (const cat of categorias) {
    await prisma.category.upsert({
      where: { id: categorias.indexOf(cat) + 1 },
      update: {},
      create: { name: cat },
    });
  }

  console.log("Categorías creadas:", categorias.length);

  // Usuarios FerCar (10): 2 admin, 3 inventario, 5 vendedores
  const password = await bcrypt.hash("123456", 10);
  const usuarios = [
    { name: "Valeria Zubieta", email: "valeria.zubieta@valeria.com", roleId: adminRole.id, locationName: null },
    { name: "Daniel Zubieta", email: "daniel.zubieta@valeria.com", roleId: adminRole.id, locationName: null },
    { name: "Alvaro Morales", email: "alvaro.morales@valeria.com", roleId: inventarioRole.id, locationName: "MELCHOR" },
    { name: "Luis Mamani", email: "luis.mamani@valeria.com", roleId: inventarioRole.id, locationName: "QUIJARRO" },
    { name: "Sergio Flores", email: "sergio.flores@valeria.com", roleId: inventarioRole.id, locationName: "CHIQUICOLLO" },
    { name: "Liz Zubieta", email: "liz.zubieta@valeria.com", roleId: tiendaRole.id, locationName: "SILES" },
    { name: "Navel Zubieta", email: "navel.zubieta@valeria.com", roleId: tiendaRole.id, locationName: "FALSURI" },
    { name: "Papachu Zubieta", email: "papachu@gmail.com", roleId: tiendaRole.id, locationName: "TUMUSLA" },
    { name: "Adrian Montero", email: "adrian.montero@valeria.com", roleId: tiendaRole.id, locationName: "TUMUSLA" },
    { name: "Jessica Lia", email: "jessica.lia@valeria.com", roleId: tiendaRole.id, locationName: "TUMUSLA" },
  ];

  for (const uInfo of usuarios) {
    const locationId = uInfo.locationName
      ? ubicacionesCreadas.find((l) => l.name === uInfo.locationName)?.id ?? null
      : null;
    const data = {
      name: uInfo.name,
      email: uInfo.email,
      password,
      roleId: uInfo.roleId,
      locationId,
    };
    await prisma.user.upsert({
      where: { email: uInfo.email },
      update: { name: uInfo.name, roleId: uInfo.roleId, locationId },
      create: data,
    });
  }

  console.log("Usuarios creados:", usuarios.length);

  await seedData(prisma);

  console.log("\n=== Datos iniciales sembrados correctamente ===");
  console.log("Credenciales (contraseña 123456 para todos):");
  for (const u of usuarios) {
    console.log(`  ${u.roleId === adminRole.id ? "Admin" : u.roleId === inventarioRole.id ? "Inventario" : "Vendedor"} | ${u.name} | ${u.email} | ${u.locationName || "-"}`);
  }
}

main()
  .catch((e) => {
    console.error("Error al sembrar datos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
