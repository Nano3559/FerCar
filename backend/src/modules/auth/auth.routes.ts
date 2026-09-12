import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { config } from "../../config";
import { AuthRequest } from "../../shared/types";
import { authenticate, authorize } from "../../shared/middlewares/auth";

const router = Router();
const prisma = new PrismaClient();

router.post("/register", authenticate, authorize("ADMIN"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, roleId, locationId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nombre, email y contraseña son requeridos" });
    }

    if (!roleId) {
      return res.status(400).json({ message: "El campo roleId es obligatorio" });
    }

    const role = await prisma.roleModel.findUnique({ where: { id: Number(roleId) } });
    if (!role) {
      return res.status(400).json({ message: "El rol especificado no existe" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: "El email ya está registrado" });
    }

    if (locationId) {
      const location = await prisma.location.findUnique({ where: { id: Number(locationId) } });
      if (!location) {
        return res.status(400).json({ message: "La ubicación especificada no existe" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId: Number(roleId),
        locationId: locationId ? Number(locationId) : null,
      },
      include: { role: true, location: true },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role.name, locationId: user.locationId },
      config.jwtSecret,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        locationId: user.locationId,
      },
    });
  } catch (error) {
    console.error("Error en register:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.post("/login", async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email y contraseña son requeridos" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, location: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    if (!user.active) {
      return res.status(403).json({ message: "Tu cuenta está desactivada. Contacta al administrador." });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role.name, locationId: user.locationId },
      config.jwtSecret,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        locationId: user.locationId,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { role: true, location: true },
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      locationId: user.locationId,
    });
  } catch (error) {
    console.error("Error en /me:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
