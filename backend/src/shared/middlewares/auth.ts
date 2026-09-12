import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { config } from "../../config";
import { AuthRequest, AuthPayload } from "../types";

const prisma = new PrismaClient();

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;

    // Refresca rol/ubicación y verifica que el usuario siga activo
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, locationId: true, active: true },
    });

    if (!user || !user.active) {
      return res.status(401).json({ message: "Usuario desactivado" });
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      locationId: user.locationId,
    } as AuthPayload;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();
  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, config.jwtSecret) as AuthPayload;
  } catch { /* ignore invalid token */ }
  next();
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "No tiene permisos para esta acción" });
    }

    next();
  };
};

export const authorizeModule = (module: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    // ADMIN always has access
    if (req.user.role === "ADMIN") return next();

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { role: true },
      });

      if (!user) return res.status(401).json({ message: "Usuario no encontrado" });

      const permissions = user.role.permissions || [];
      if (!permissions.includes(module)) {
        return res.status(403).json({ message: `No tiene acceso al módulo: ${module}` });
      }

      next();
    } catch {
      return res.status(500).json({ message: "Error al verificar permisos" });
    }
  };
};

/**
 * Exige que los usuarios TIENDA tengan una ubicación asignada. Los usuarios
 * de otros roles pasan sin restricción. Devuelve 403 si un TIENDA no tiene
 * locationId (no puede operar sobre datos de ubicación sin estar asignado a una).
 */
export const requireTiendaLocation = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role === "TIENDA" && !req.user.locationId) {
    return res.status(403).json({ message: "Usuario TIENDA sin ubicación asignada" });
  }
  next();
};

/**
 * Bloquea por completo el acceso de usuarios TIENDA a una ruta/recurso.
 * Util para endpoints administrativos globales (proveedores, costos, etc.).
 */
export const blockTienda = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role === "TIENDA") {
    return res.status(403).json({ message: "Acción no permitida para usuario TIENDA" });
  }
  next();
};
