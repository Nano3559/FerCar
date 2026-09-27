export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  locationId: number | null;
  permissions?: string[];
}

export interface Product {
  id: number;
  itemCode: string;
  manufacturer: string;
  name: string;
  brand: string;
  model: string;
  year: string;
  detail?: string;
  oemCode?: string;
  factoryCode?: string;
  image?: string;
  price1: number;
  price2: number;
  wholesalePrice?: number;
  cost?: number;
  stockTotal: number;
}

export interface Location {
  id: number;
  name: string;
  type: "ALMACEN" | "TIENDA";
  address?: string;
}

export interface Inventory {
  id: number;
  productId: number;
  locationId: number;
  stock: number;
  minStock: number;
}

export interface Sale {
  id: number;
  saleDate: string;
  total: number;
  type: "NORMAL" | "MAYOR";
  userId: number;
  locationId: number;
  customerId?: number;
  items: SaleItem[];
  payments: Payment[];
}

export interface SaleItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  product?: Product;
}

export interface Payment {
  id: number;
  method: "EFECTIVO" | "QR" | "TRANSFERENCIA" | "CREDITO";
  amount: number;
  date: string;
}

export interface Movement {
  id: number;
  productId: number;
  fromLocationId: number;
  toLocationId: number;
  quantity: number;
  userId: number;
  date: string;
  observation?: string;
  requester?: string | null;
  product?: Product;
  fromLocation?: Location;
  toLocation?: Location;
}

export interface ProductRequest {
  id: number;
  productId: number;
  quantity: number;
  requestedById: number;
  locationId: number;
  status: "PENDIENTE" | "EN_PREPARACION" | "ENVIADO" | "RECIBIDO" | "CANCELADO";
  date: string;
  product?: Product;
  location?: Location;
}

export interface Return {
  id: number;
  saleId: number;
  productId: number;
  reason: string;
  quantity: number;
  amount: number;
  method: string;
  date: string;
}
