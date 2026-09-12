import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { authenticate, authorize } from "../../shared/middlewares/auth";
import { AuthRequest } from "../../shared/types";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET / — Listar usuarios (solo ADMIN)
router.get("/", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        role: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roleId: u.roleId,
        role: u.role.name,
        locationId: u.locationId,
        locationName: u.location?.name || "N/A",
        active: u.active,
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /roles — Listar roles disponibles (solo ADMIN)
router.get("/roles", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const roles = await prisma.roleModel.findMany({
      select: { id: true, name: true, permissions: true },
      orderBy: { name: "asc" },
    });
    res.json({ roles });
  } catch (error) {
    console.error("Error al listar roles:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST / — Crear usuario (solo ADMIN)
router.post("/", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role, roleId, locationId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nombre, email y contraseña son obligatorios" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: "Ya existe un usuario con ese email" });
    }

    let finalRoleId = roleId;
    if (!finalRoleId && role) {
      const roleRecord = await prisma.roleModel.findFirst({ where: { name: role } });
      if (!roleRecord) {
        return res.status(400).json({ message: `Rol "${role}" no encontrado` });
      }
      finalRoleId = roleRecord.id;
    }
    if (!finalRoleId) {
      return res.status(400).json({ message: "Debe especificar un rol (role o roleId)" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId: finalRoleId,
        locationId: locationId ? Number(locationId) : null,
      },
      include: {
        role: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      role: user.role.name,
      locationId: user.locationId,
      locationName: user.location?.name || "N/A",
      active: user.active,
    });
  } catch (error: any) {
    console.error("Error al crear usuario:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

// PUT /:id — Actualizar usuario (solo ADMIN)
router.put("/:id", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });

    const existing = await prisma.user.findUnique({
      where: { id },
      include: { role: { select: { id: true, name: true } } },
    });
    if (!existing) return res.status(404).json({ message: "Usuario no encontrado" });

    const { name, email, password, role, roleId, locationId, active } = req.body;

    let finalRoleId = roleId;
    if (!finalRoleId && role) {
      const roleRecord = await prisma.roleModel.findFirst({ where: { name: role } });
      if (roleRecord) finalRoleId = roleRecord.id;
    }

    if (req.user?.userId === id && finalRoleId && Number(finalRoleId) !== existing.roleId) {
      const targetRole = await prisma.roleModel.findUnique({ where: { id: Number(finalRoleId) } });
      if (targetRole && targetRole.name !== "ADMIN") {
        return res.status(400).json({ message: "No puedes cambiar tu propio rol" });
      }
    }

    // Desactivar la propia cuenta está bloqueado
    if (active === false && req.user?.userId === id) {
      return res.status(400).json({ message: "No puedes desactivar tu propia cuenta" });
    }

    // No permitir dejar al sistema sin administradores activos
    if (active === false && existing.role.name === "ADMIN") {
      const activeAdmins = await prisma.user.count({
        where: { role: { name: "ADMIN" }, active: true },
      });
      if (activeAdmins <= 1) {
        return res.status(400).json({ message: "No puedes desactivar al último administrador activo" });
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (finalRoleId) updateData.roleId = finalRoleId;
    if (locationId !== undefined) updateData.locationId = locationId ? Number(locationId) : null;
    if (typeof active === "boolean") updateData.active = active;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No hay datos para actualizar" });
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        role: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      role: user.role.name,
      locationId: user.locationId,
      locationName: user.location?.name || "N/A",
      active: user.active,
    });
  } catch (error: any) {
    console.error("Error al actualizar usuario:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

// GET /me/preferences — Obtener preferencias de columnas del usuario actual
router.get("/me/preferences", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { columnPrefs: true },
    });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ columnPrefs: user.columnPrefs || {} });
  } catch (error) {
    console.error("Error al obtener preferencias:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// PUT /me/preferences — Guardar preferencias de columnas del usuario actual
router.put("/me/preferences", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });
    const { columnPrefs } = req.body;
    if (!columnPrefs || typeof columnPrefs !== "object") {
      return res.status(400).json({ message: "columnPrefs debe ser un objeto" });
    }
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { columnPrefs },
      select: { columnPrefs: true },
    });
    res.json({ columnPrefs: user.columnPrefs });
  } catch (error) {
    console.error("Error al guardar preferencias:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// DELETE /:id — Eliminar usuario (solo ADMIN)
router.delete("/:id", authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Usuario no encontrado" });

    if (req.user?.userId === id) {
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ message: "Usuario eliminado" });
  } catch (error: any) {
    console.error("Error al eliminar usuario:", error);
    res.status(500).json({ message: error.message || "Error interno del servidor" });
  }
});

export default router;
