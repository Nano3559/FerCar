import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Job diario a las 08:05:
//  Activa solicitudes de reposición cuyo expectedDate ya llegó.
//  La reposición por stock mínimo se genera solo al vender (no por barrido masivo).
async function runReplenishCheck() {
  try {
    const now = new Date();

    // 1) Activar solicitudes programadas: PENDIENTE -> RECIBIDO_POR_INVENTARIO
    const due = await prisma.productRequest.findMany({
      where: {
        expectedDate: { lte: now },
        status: "PENDIENTE",
      },
      include: { product: true, location: true, requestedBy: true },
    });

    for (const req of due) {
      await prisma.$transaction(async (tx) => {
        await tx.productRequest.update({
          where: { id: req.id },
          data: { status: "RECIBIDO_POR_INVENTARIO" },
        });

        await tx.requestHistory.create({
          data: {
            requestId: req.id,
            previousStatus: "PENDIENTE",
            newStatus: "RECIBIDO_POR_INVENTARIO",
            userId: req.requestedById,
            userRole: "AUTOMATICO",
          },
        });

        // Notificar a todos los usuarios del rol INVENTARIO
        const inventarioUsers = await tx.user.findMany({ where: { role: { name: "INVENTARIO" } } });
        for (const u of inventarioUsers) {
          await tx.notification.create({
            data: {
              userId: u.id,
              title: "Reposición disponible",
              message: `El producto "${req.product.name}" fue recibido por inventario (solicitud #${req.id} a ${req.location.name}).`,
              type: "INFO",
              linkUrl: "/panel/solicitudes",
            },
          });
        }
      });

      console.log(`[replenish] Solicitud #${req.id} recibida por inventario (${req.product.name})`);
    }

    if (due.length > 0) console.log(`[replenish] ${due.length} solicitudes activadas a las ${now.toISOString()}`);
  } catch (err) {
    console.error("[replenish] Error ejecutando job de reposición:", err);
  }
}

export function startReplenishJob() {
  cron.schedule("5 8 * * *", runReplenishCheck, { timezone: "America/La_Paz" });
  console.log("[replenish] Job de reposición programado (diario 08:05 America/La_Paz)");
}