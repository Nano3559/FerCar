import express from "express";
import cors from "cors";
import { config } from "./config";
import { errorHandler } from "./shared/middlewares";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import productsRoutes from "./modules/products/products.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import locationsRoutes from "./modules/locations/locations.routes";
import salesRoutes from "./modules/sales/sales.routes";
import wholesaleRoutes from "./modules/wholesale/wholesale.routes";
import movementsRoutes from "./modules/movements/movements.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import returnsRoutes from "./modules/returns/returns.routes";
import requestsRoutes from "./modules/requests/requests.routes";
import costsRoutes from "./modules/costs/costs.routes";
import suppliersRoutes from "./modules/suppliers/suppliers.routes";
import pricesRoutes from "./modules/prices/prices.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import customersRoutes from "./modules/customers/customers.routes";
import publicRoutes from "./modules/public/public.routes";
import permissionsRoutes from "./modules/permissions/permissions.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import purchaseNotesRoutes from "./modules/purchase-notes/purchaseNotes.routes";

const app = express();

app.use(cors({
  origin: [config.frontendUrl, config.mobileUrl],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/locations", locationsRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/wholesale", wholesaleRoutes);
app.use("/api/movements", movementsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/returns", returnsRoutes);
app.use("/api/requests", requestsRoutes);
app.use("/api/costs", costsRoutes);
app.use("/api/suppliers", suppliersRoutes);
app.use("/api/prices", pricesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/purchase-notes", purchaseNotesRoutes);
app.use("/api/public", publicRoutes);

app.use(errorHandler);

export default app;
