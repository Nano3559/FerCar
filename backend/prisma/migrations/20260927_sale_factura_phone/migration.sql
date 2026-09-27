-- La venta departamental distingue tres personas: quien compra (cliente), quien
-- recoge (envio) y a quien se factura, que a veces es un tercero. Cada una tiene
-- su celular, y el modelo solo tenia uno.
ALTER TABLE "Sale" ADD COLUMN "telefonoFactura" TEXT;
