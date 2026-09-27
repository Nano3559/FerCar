// La factura ahora se llena con los datos del cliente (un solo bloque).
// Se confirma que el backend siga guardando los tres destinos correctos.
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const prisma = new PrismaClient();

const BASE = "http://localhost:4117/api";
const secret = fs.readFileSync(".env", "utf8").match(/JWT_SECRET=(.+)/)[1].trim().replace(/^"|"$/g, "");

let fallos = 0;
const check = (ok, msg) => { console.log(`${ok ? "OK   " : "FALLA"} ${msg}`); if (!ok) fallos++; };

(async () => {
  const admin = await prisma.user.findFirst({ where: { role: { name: "ADMIN" }, active: true } });
  const tienda = await prisma.location.findFirst({ where: { type: "TIENDA" } });
  const token = jwt.sign({ userId: admin.id, email: admin.email, role: "ADMIN", locationId: tienda.id }, secret, { expiresIn: "1h" });
  const post = (url, body) => fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const p = await prisma.product.findFirst({ where: { inventories: { some: { locationId: tienda.id, stock: { gt: 3 } } } } });
  const stock0 = (await prisma.inventory.findUnique({ where: { productId_locationId: { productId: p.id, locationId: tienda.id } } })).stock;
  const precio = Number(p.price1) || 100;

  // Con factura: el cliente y la factura son la misma persona.
  let r = await post("/sales", {
    type: "DEPARTAMENTAL",
    items: [{ productId: p.id, quantity: 1, unitPrice: precio }],
    payments: [{ method: "EFECTIVO", amount: precio }],
    requiereFactura: true,
    customerData: { name: "JUAN PEREZ", nit: "1234567", phone: "70123456" },
    paraQuien: "MARIA LOPEZ",
    lugarEntrega: "Av. Central 100",
    telefono: "70987654",
    datosFactura: "1234567",
    nitName: "JUAN PEREZ",
    telefonoFactura: "70123456",
  });
  let v = await r.json();
  check(r.status === 201, `crear con factura -> ${r.status}`);
  const g = await prisma.sale.findUnique({ where: { id: v.id }, include: { customer: true } });
  check(g.customer?.name === "JUAN PEREZ", `cliente: ${g.customer?.name}`);
  check(g.nitName === "JUAN PEREZ", `factura nombre: ${g.nitName}`);
  check(g.datosFactura === "1234567", `factura CI/NIT: ${g.datosFactura}`);
  check(g.telefonoFactura === "70123456", `factura celular: ${g.telefonoFactura}`);
  check(g.paraQuien === "MARIA LOPEZ", `quien recoge (distinto): ${g.paraQuien}`);
  check(g.customer?.phone === "70123456" && g.telefono === "70987654", "los dos celulares se guardan aparte");

  // Sin factura: no se inventan datos de factura, el envio si se guarda.
  r = await post("/sales", {
    type: "DEPARTAMENTAL",
    items: [{ productId: p.id, quantity: 1, unitPrice: precio }],
    payments: [{ method: "EFECTIVO", amount: precio }],
    requiereFactura: false,
    paraQuien: "PEPE GOMEZ",
    lugarEntrega: "Calle 5",
    telefono: "70000000",
    datosFactura: "1234567",
    nitName: "JUAN PEREZ",
    telefonoFactura: "70123456",
  });
  const v2 = await r.json();
  check(r.status === 201, `crear sin factura -> ${r.status}`);
  check(v2.paraQuien === "PEPE GOMEZ", `envio se guarda: ${v2.paraQuien}`);
  check(v2.nitName === null && v2.datosFactura === null && v2.telefonoFactura === null, "sin factura no se guardan datos de factura");

  const ids = [v.id, v2.id];
  for (const id of ids) {
    await prisma.payment.deleteMany({ where: { saleId: id } });
    await prisma.saleItem.deleteMany({ where: { saleId: id } });
    await prisma.sale.delete({ where: { id } });
  }
  await prisma.inventory.update({
    where: { productId_locationId: { productId: p.id, locationId: tienda.id } },
    data: { stock: stock0 },
  });
  check((await prisma.sale.count({ where: { id: { in: ids } } })) === 0, "limpieza y stock restaurado");

  console.log(`\n${fallos === 0 ? "TODO OK" : fallos + " FALLAS"}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
