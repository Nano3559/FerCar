import { PrismaClient } from "@prisma/client";

export const productSeed = [
  // FRENOS (8)
  { itemCode: "FRN-001", manufacturer: "Brembo", name: "Pastillas de Freno Delanteras", brand: "Toyota", model: "Hilux", year: "2020-2024", detail: "Cerámica alta resistencia", oemCode: "04465-0C010", factoryCode: "BRM-HLX20", price1: 250, price2: 280, wholesalePrice: 200, cost: 140, cat: "Frenos" },
  { itemCode: "FRN-002", manufacturer: "TRW", name: "Disco de Freno Delantero", brand: "Toyota", model: "Hilux", year: "2020-2024", detail: "Ventilado 320mm", oemCode: "43512-0K030", factoryCode: "TRW-DHL32", price1: 320, price2: 350, wholesalePrice: 260, cost: 180, cat: "Frenos" },
  { itemCode: "FRN-003", manufacturer: "Akebono", name: "Pastillas de Freno Traseras", brand: "Nissan", model: "Frontier", year: "2021-2024", detail: "Semimetálica", oemCode: "4M580-4GA0B", factoryCode: "AKB-NFT21", price1: 195, price2: 220, wholesalePrice: 160, cost: 110, cat: "Frenos" },
  { itemCode: "FRN-004", manufacturer: "Bosch", name: "Disco de Freno Trasero", brand: "Nissan", model: "Sentra", year: "2020-2024", detail: "Liso 260mm", oemCode: "D4060-3TA0A", factoryCode: "BSH-DST26", price1: 255, price2: 280, wholesalePrice: 195, cost: 125, cat: "Frenos" },
  { itemCode: "FRN-005", manufacturer: "Aisin", name: "Caliper de Freno Delantero", brand: "Mazda", model: "CX-5", year: "2021-2024", detail: "Completo con pistón", oemCode: "NA01-33-28XB", factoryCode: "AIS-CF-CX5", price1: 600, price2: 650, wholesalePrice: 480, cost: 310, cat: "Frenos" },
  { itemCode: "FRN-006", manufacturer: "Continental", name: "Manguera de Freno Delantera", brand: "Toyota", model: "Corolla", year: "2020-2024", detail: "Goma reforzada par", oemCode: "90919-02228", factoryCode: "CON-MF-COR", price1: 82, price2: 95, wholesalePrice: 65, cost: 35, cat: "Frenos" },
  { itemCode: "FRN-007", manufacturer: "Centric", name: "Retenedor de Caliper", brand: "Honda", model: "Civic", year: "2022-2024", detail: "Kit de reparación caliper", oemCode: "45104-SM4-A01", factoryCode: "CTR-RC-CIV", price1: 105, price2: 120, wholesalePrice: 80, cost: 42, cat: "Frenos" },
  { itemCode: "FRN-008", manufacturer: "Wagner", name: "Pastillas Cerámicas Premium", brand: "Hyundai", model: "Tucson", year: "2021-2024", detail: "Baja suciedad", oemCode: "58117-L0000", factoryCode: "WGN-PC-TUC", price1: 280, price2: 310, wholesalePrice: 210, cost: 135, cat: "Frenos" },

  // MOTOR (8)
  { itemCode: "MTR-001", manufacturer: "Denso", name: "Bujía de Encendido", brand: "Toyota", model: "Corolla", year: "2020-2024", detail: "Iridium FK20HR11", oemCode: "90919-01275", factoryCode: "DNS-FK20", price1: 55, price2: 65, wholesalePrice: 40, cost: 22, cat: "Motor" },
  { itemCode: "MTR-002", manufacturer: "NGK", name: "Bujía de Encendido", brand: "Mazda", model: "CX-5", year: "2021-2024", detail: "Laser Iridium", oemCode: "PYRA-11EG", factoryCode: "NGK-PYRA", price1: 60, price2: 72, wholesalePrice: 45, cost: 25, cat: "Motor" },
  { itemCode: "MTR-003", manufacturer: "Bosch", name: "Bobina de Encendido", brand: "Nissan", model: "Sentra", year: "2020-2024", detail: "Bobina pack 4 unidades", oemCode: "22433-3TA0A", factoryCode: "BSH-BN4S", price1: 380, price2: 420, wholesalePrice: 300, cost: 200, cat: "Motor" },
  { itemCode: "MTR-004", manufacturer: "Denso", name: "Bomba de Agua", brand: "Toyota", model: "Hilux", year: "2016-2024", detail: "Con termostato", oemCode: "16100-0C090", factoryCode: "DNS-BA-HLX", price1: 530, price2: 580, wholesalePrice: 420, cost: 260, cat: "Motor" },
  { itemCode: "MTR-005", manufacturer: "Gates", name: "Correa de Distribución", brand: "Honda", model: "Civic", year: "2022-2024", detail: "Kit completo + tensor", oemCode: "14400-5AA-A00", factoryCode: "GTS-CD-CIV", price1: 410, price2: 450, wholesalePrice: 320, cost: 195, cat: "Motor" },
  { itemCode: "MTR-006", manufacturer: "Mahle", name: "Juego de Juntas", brand: "Toyota", model: "Corolla", year: "2020-2024", detail: "Junta de tapa completa", oemCode: "11115-15051", factoryCode: "MAH-JJ-COR", price1: 350, price2: 380, wholesalePrice: 270, cost: 160, cat: "Motor" },
  { itemCode: "MTR-007", manufacturer: "Iridium", name: "Válvula EGR", brand: "Ford", model: "Ranger", year: "2019-2024", detail: "Electrónica recondicionada", oemCode: "JL3E-9J460-B", factoryCode: "IRD-VE-RNG", price1: 660, price2: 720, wholesalePrice: 520, cost: 330, cat: "Motor" },
  { itemCode: "MTR-008", manufacturer: "SKF", name: "Rodamiento de Cigüeñal", brand: "Nissan", model: "Frontier", year: "2021-2024", detail: "Juego 5 unidades", oemCode: "12202-4MA0A", factoryCode: "SKF-RC-NF", price1: 310, price2: 340, wholesalePrice: 240, cost: 150, cat: "Motor" },

  // SUSPENSIÓN (6)
  { itemCode: "SUS-001", manufacturer: "Monroe", name: "Amortiguador Delantero", brand: "Toyota", model: "Prado", year: "2018-2024", detail: "Gas-Matic premium", oemCode: "48520-60461", factoryCode: "MON-DPR18", price1: 440, price2: 480, wholesalePrice: 350, cost: 220, cat: "Suspensión" },
  { itemCode: "SUS-002", manufacturer: "KYB", name: "Amortiguador Trasero", brand: "Mazda", model: "CX-5", year: "2020-2024", detail: "Excel-G", oemCode: "KV114-AD01A", factoryCode: "KYB-CX5T", price1: 290, price2: 320, wholesalePrice: 230, cost: 150, cat: "Suspensión" },
  { itemCode: "SUS-003", manufacturer: "Sachs", name: "Brazo de Suspensión Inferior", brand: "Toyota", model: "Corolla", year: "2020-2024", detail: "Con rótula", oemCode: "48068-02130", factoryCode: "SAC-BCR20", price1: 260, price2: 290, wholesalePrice: 200, cost: 130, cat: "Suspensión" },
  { itemCode: "SUS-004", manufacturer: "Moog", name: "Rótula Inferior", brand: "Nissan", model: "Frontier", year: "2021-2024", detail: "Heavy duty", oemCode: "54400-4MA0B", factoryCode: "MOG-RI-NF", price1: 165, price2: 180, wholesalePrice: 130, cost: 80, cat: "Suspensión" },
  { itemCode: "SUS-005", manufacturer: "Trophy", name: "Estabilizadora Delantera", brand: "Hyundai", model: "Tucson", year: "2021-2024", detail: "Barra completa con bujes", oemCode: "54812-2P200", factoryCode: "TRF-ED-TUC", price1: 220, price2: 240, wholesalePrice: 170, cost: 100, cat: "Suspensión" },
  { itemCode: "SUS-006", manufacturer: "RideControl", name: "Buje de Suspensión", brand: "Ford", model: "Ranger", year: "2019-2024", detail: "Políuretano par", oemCode: "BL3Z-3K165-A", factoryCode: "RDC-BS-RNG", price1: 135, price2: 150, wholesalePrice: 100, cost: 55, cat: "Suspensión" },

  // ELÉCTRICO (6)
  { itemCode: "ELC-001", manufacturer: "Valeo", name: "Alternador", brand: "Toyota", model: "Hilux", year: "2016-2024", detail: "14V 130A", oemCode: "27060-0C060", factoryCode: "VAL-AHL130", price1: 780, price2: 850, wholesalePrice: 650, cost: 400, cat: "Eléctrico" },
  { itemCode: "ELC-002", manufacturer: "Mitsubishi", name: "Marcha de Arranque", brand: "Nissan", model: "Sentra", year: "2020-2024", detail: "12V 1.0kW", oemCode: "23300-4MA0B", factoryCode: "MIT-MSN20", price1: 620, price2: 680, wholesalePrice: 500, cost: 320, cat: "Eléctrico" },
  { itemCode: "ELC-003", manufacturer: "Hella", name: "Foco Halógeno H7", brand: "Mazda", model: "CX-5", year: "2020-2024", detail: "Ultra Blue 55W par", oemCode: "9-999-033-550", factoryCode: "HEL-H7CX", price1: 105, price2: 120, wholesalePrice: 80, cost: 45, cat: "Eléctrico" },
  { itemCode: "ELC-004", manufacturer: "Bosch", name: "Sensor de Oxígeno", brand: "Toyota", model: "Corolla", year: "2020-2024", detail: "Delantero universal", oemCode: "89467-02090", factoryCode: "BSH-SO-COR", price1: 350, price2: 380, wholesalePrice: 270, cost: 165, cat: "Eléctrico" },
  { itemCode: "ELC-005", manufacturer: "Narrative", name: "Módulo de Encendido", brand: "Honda", model: "Civic", year: "2022-2024", detail: "ECU de encendido", oemCode: "37820-5AA-A11", factoryCode: "NRV-ME-CIV", price1: 870, price2: 950, wholesalePrice: 700, cost: 440, cat: "Eléctrico" },
  { itemCode: "ELC-006", manufacturer: "Osram", name: "Foco LED H11", brand: "Hyundai", model: "Tucson", year: "2021-2024", detail: "Night Breaker 6000K par", oemCode: "92102-L0100", factoryCode: "OSR-FL-TUC", price1: 255, price2: 280, wholesalePrice: 195, cost: 120, cat: "Eléctrico" },

  // FILTROS (6)
  { itemCode: "FLT-001", manufacturer: "Mann", name: "Filtro de Aceite", brand: "Toyota", model: "Hilux", year: "2016-2024", detail: "W 811/80", oemCode: "04152-YZZA1", factoryCode: "MAN-W811", price1: 38, price2: 45, wholesalePrice: 28, cost: 15, cat: "Filtros" },
  { itemCode: "FLT-002", manufacturer: "Bosch", name: "Filtro de Aire", brand: "Nissan", model: "Frontier", year: "2021-2024", detail: "Panel filtrante", oemCode: "21010-4KA0A", factoryCode: "BSH-FA-NF", price1: 72, price2: 85, wholesalePrice: 55, cost: 30, cat: "Filtros" },
  { itemCode: "FLT-003", manufacturer: "Mahle", name: "Filtro de Combustible", brand: "Mazda", model: "CX-5", year: "2020-2024", detail: "Elemento carbón activado", oemCode: "PE01-13-270", factoryCode: "MAH-FCX5", price1: 82, price2: 95, wholesalePrice: 65, cost: 35, cat: "Filtros" },
  { itemCode: "FLT-004", manufacturer: "K&N", name: "Filtro de Aire Deportivo", brand: "Toyota", model: "Corolla", year: "2020-2024", detail: "Reutilizable lavable", oemCode: "33-2304", factoryCode: "KN-FA-COR", price1: 295, price2: 320, wholesalePrice: 230, cost: 140, cat: "Filtros" },
  { itemCode: "FLT-005", manufacturer: "Filtron", name: "Filtro de Cabina", brand: "Ford", model: "Ranger", year: "2019-2024", detail: "Con carbón activado", oemCode: "FJ7E-19B629-AA", factoryCode: "FLT-FC-RNG", price1: 95, price2: 110, wholesalePrice: 72, cost: 38, cat: "Filtros" },
  { itemCode: "FLT-006", manufacturer: "Denso", name: "Filtro de Aceite Hidráulico", brand: "Nissan", model: "Sentra", year: "2020-2024", detail: "Transmisión CVT", oemCode: "31390-3TX0A", factoryCode: "DNS-FAH-SEN", price1: 125, price2: 140, wholesalePrice: 95, cost: 55, cat: "Filtros" },

  // CARROCERÍA (6)
  { itemCode: "CAR-001", manufacturer: "Steelcraft", name: "Parachoque Delantero", brand: "Toyota", model: "Hilux", year: "2020-2024", detail: "Completo con parrilla", oemCode: "52111-0C030", factoryCode: "STL-PH20", price1: 880, price2: 950, wholesalePrice: 700, cost: 450, cat: "Carrocería" },
  { itemCode: "CAR-002", manufacturer: "TYC", name: "Retrovisor Lateral Izquierdo", brand: "Nissan", model: "Frontier", year: "2021-2024", detail: "Con luz LED integrada", oemCode: "87810-4KA5A", factoryCode: "TYC-RFL-NF", price1: 340, price2: 380, wholesalePrice: 270, cost: 170, cat: "Carrocería" },
  { itemCode: "CAR-003", manufacturer: "Depo", name: "Farola Delantera Derecha", brand: "Mazda", model: "CX-5", year: "2021-2024", detail: "LED completa", oemCode: "GJ6A-51-030C", factoryCode: "DPO-FD-CX5", price1: 1000, price2: 1100, wholesalePrice: 800, cost: 520, cat: "Carrocería" },
  { itemCode: "CAR-004", manufacturer: "MGP", name: "Parrilla Delantera", brand: "Ford", model: "Ranger", year: "2019-2024", detail: "Cromada premium", oemCode: "FL3Z-17682-B", factoryCode: "MGP-PD-RNG", price1: 720, price2: 780, wholesalePrice: 560, cost: 350, cat: "Carrocería" },
  { itemCode: "CAR-005", manufacturer: "Evan-Fischer", name: "Parachoque Trasero", brand: "Hyundai", model: "Tucson", year: "2021-2024", detail: "Pintable", oemCode: "86611-L0100", factoryCode: "EVF-PT-TUC", price1: 570, price2: 620, wholesalePrice: 440, cost: 280, cat: "Carrocería" },
  { itemCode: "CAR-006", manufacturer: "Alloy", name: "Tapa de Combustible", brand: "Honda", model: "Civic", year: "2022-2024", detail: "Cromada cierre central", oemCode: "76301-TBA-A00", factoryCode: "ALY-TC-CIV", price1: 75, price2: 85, wholesalePrice: 55, cost: 28, cat: "Carrocería" },

  // TRANSMISIÓN (6)
  { itemCode: "TRN-001", manufacturer: "Aisin", name: "Kit de Embrague", brand: "Toyota", model: "Corolla", year: "2020-2024", detail: "Disco + presión + rodamiento", oemCode: "31250-02280", factoryCode: "AIS-KEC20", price1: 1100, price2: 1200, wholesalePrice: 900, cost: 580, cat: "Transmisión" },
  { itemCode: "TRN-002", manufacturer: "Exedy", name: "Kit de Embrague", brand: "Mazda", model: "CX-5", year: "2021-2024", detail: "Disco + presión + desembrague", oemCode: "KD023-16-301", factoryCode: "EXD-KEC5", price1: 1000, price2: 1100, wholesalePrice: 820, cost: 520, cat: "Transmisión" },
  { itemCode: "TRN-003", manufacturer: "Sachs", name: "Cilindro Maestro de Embrague", brand: "Nissan", model: "Frontier", year: "2021-2024", detail: "Hidráulico", oemCode: "30610-4MA0A", factoryCode: "SAC-CME-NF", price1: 350, price2: 380, wholesalePrice: 270, cost: 165, cat: "Transmisión" },
  { itemCode: "TRN-004", manufacturer: "Monroe", name: "Amortiguador de Transmisión", brand: "Ford", model: "Ranger", year: "2019-2024", detail: "Universal 2 posiciones", oemCode: "F2TZ-7A248-A", factoryCode: "MON-AT-RNG", price1: 255, price2: 280, wholesalePrice: 195, cost: 120, cat: "Transmisión" },
  { itemCode: "TRN-005", manufacturer: "SKF", name: "Retén de Transmisión", brand: "Toyota", model: "Hilux", year: "2016-2024", detail: "Kit completo 4 piezas", oemCode: "36103-30171", factoryCode: "SKF-RT-HLX", price1: 82, price2: 95, wholesalePrice: 60, cost: 30, cat: "Transmisión" },

  // ADICIONALES (11)
  { itemCode: "ADI-001", manufacturer: "Behr", name: "Radiador de Agua", brand: "Toyota", model: "Prado", year: "2018-2024", detail: "Aluminio completo", oemCode: "16400-66060", factoryCode: "BEH-RA-PRD", price1: 1280, price2: 1400, wholesalePrice: 1000, cost: 620, cat: "Motor" },
  { itemCode: "ADI-002", manufacturer: "Febi", name: "Tapa de Radiador", brand: "Nissan", model: "Frontier", year: "2021-2024", detail: "Presión 1.1 bar", oemCode: "21430-4MA0A", factoryCode: "FEB-TR-NF", price1: 38, price2: 45, wholesalePrice: 28, cost: 12, cat: "Motor" },
  { itemCode: "ADI-003", manufacturer: "Dayco", name: "Correa Serpentina", brand: "Mazda", model: "CX-5", year: "2020-2024", detail: "6PK 2175", oemCode: "PY2W-10-380A", factoryCode: "DAY-CS-CX5", price1: 145, price2: 160, wholesalePrice: 110, cost: 65, cat: "Motor" },
  { itemCode: "ADI-004", manufacturer: "Corteco", name: "Soporte de Motor", brand: "Honda", model: "Civic", year: "2022-2024", detail: "Políuretano par", oemCode: "50810-TBA-A01", factoryCode: "CTC-SM-CIV", price1: 265, price2: 290, wholesalePrice: 200, cost: 120, cat: "Motor" },
  { itemCode: "ADI-005", manufacturer: "FEBI", name: "Manguera de Radiador", brand: "Hyundai", model: "Tucson", year: "2021-2024", detail: "Superior reforzada", oemCode: "25422-L0100", factoryCode: "FEB-MR-TUC", price1: 115, price2: 130, wholesalePrice: 85, cost: 42, cat: "Motor" },
  { itemCode: "ADI-006", manufacturer: "URO", name: "Depósito de Expansión", brand: "Ford", model: "Ranger", year: "2019-2024", detail: "Con sensor de nivel", oemCode: "F1TZ-8A080-B", factoryCode: "URO-DE-RNG", price1: 165, price2: 180, wholesalePrice: 125, cost: 70, cat: "Motor" },
  { itemCode: "ADI-007", manufacturer: "Gates", name: "Serpentina AC", brand: "Toyota", model: "Corolla", year: "2020-2024", detail: "6PK 1538", oemCode: "88310-02440", factoryCode: "GTS-SAC-COR", price1: 82, price2: 95, wholesalePrice: 62, cost: 32, cat: "Motor" },
  { itemCode: "ADI-008", manufacturer: "VAICO", name: "Tensador de Correa", brand: "Nissan", model: "Sentra", year: "2020-2024", detail: "Hidráulico", oemCode: "23760-3TA0A", factoryCode: "VAC-TC-SEN", price1: 200, price2: 220, wholesalePrice: 155, cost: 90, cat: "Motor" },
  { itemCode: "ADI-009", manufacturer: "Dorman", name: "Soporte de Transmisión", brand: "Mazda", model: "CX-5", year: "2021-2024", detail: "Políuretano", oemCode: "D2AZ-7A248-A", factoryCode: "DRM-ST-CX5", price1: 240, price2: 260, wholesalePrice: 185, cost: 110, cat: "Transmisión" },
  { itemCode: "ADI-010", manufacturer: "Echlin", name: "Sensor MAP", brand: "Honda", model: "Civic", year: "2022-2024", detail: "Delgado 3 pines", oemCode: "37870-5AA-A01", factoryCode: "ECH-SMAP-CIV", price1: 175, price2: 190, wholesalePrice: 135, cost: 78, cat: "Eléctrico" },
  { itemCode: "ADI-011", manufacturer: "SMP", name: "Termostato", brand: "Ford", model: "Ranger", year: "2019-2024", detail: "82°C con sello", oemCode: "BT4Z-8255-B", factoryCode: "SMP-TER-RNG", price1: 135, price2: 150, wholesalePrice: 100, cost: 55, cat: "Motor" },
];

export const suppliersSeed = [
  { name: "Importaciones Automotrices Bolivia", nit: "1025478963", phone: "+591 4 4567890" },
  { name: "Distribuidora de Repuestos del Sur", nit: "1254789630", phone: "+591 4 5678901" },
  { name: "Repuestos Original S.R.L.", nit: "1547896302", phone: "+591 2 6789012" },
  { name: "Importadora Japón Parts", nit: "1698745230", phone: "+591 4 7891234" },
  { name: "Distribuidora Coreana del Norte", nit: "1856478920", phone: "+591 3 4561234" },
  { name: "Repuestos Premium S.A.", nit: "2014569873", phone: "+591 2 3451234" },
  { name: "Importadora BrasilAuto", nit: "1425369874", phone: "+591 3 5671234" },
  { name: "TecnoPartes Internacionales", nit: "1789654123", phone: "+591 4 6781234" },
];

export const customersSeed = [
  { name: "Juan Pérez", nit: "4567890", phone: "+591 71234567" },
  { name: "María López", nit: "6543210", phone: "+591 72345678" },
  { name: "Taller Mecánico El Racing", nit: "9876543", phone: "+591 4 7890123" },
  { name: "Distribuciones Santa Cruz S.A.", nit: "1234567", phone: "+591 3 4567890" },
  { name: "Transportes Bolívar", nit: "7654321", phone: "+591 7 3456789" },
  { name: "Constructora Los Andes", nit: "3216547", phone: "+591 2 8901234" },
  { name: "Minera San Cristóbal", nit: "5678912", phone: "+591 2 9012345" },
  { name: "Agrícola del Valle", nit: "8912345", phone: "+591 4 0123456" },
  { name: "Flota de Buses Tropical", nit: "4321658", phone: "+591 3 1234567" },
  { name: "Taller Don Carlos", nit: "6789123", phone: "+591 7 2345678" },
  { name: "AutoParts Express S.R.L.", nit: "2345678", phone: "+591 4 3456789" },
  { name: "Mecánica Rápida Cochabamba", nit: "9871234", phone: "+591 4 4567891" },
  { name: "Transporte Pesado Urupiti", nit: "5432167", phone: "+591 7 5678912" },
  { name: "Garage El Mecánico", nit: "8765432", phone: "+591 7 6789123" },
  { name: "Concesionario AutoBol", nit: "1357924", phone: "+591 2 7891234" },
];

export const importersSeed = [
  { name: "Importadora El Sol", phone: "+591 4 4561001", email: "contacto@elsol.com", city: "Cochabamba", description: "Especialistas en repuestos Toyota y Lexus" },
  { name: "Repuestos del Norte", phone: "+591 4 4561002", email: "ventas@repuestosnorte.com", city: "Cochabamba", description: "Repuestos Nissan y Mitsubishi de origen asiático" },
  { name: "AutoPartes Premium", phone: "+591 4 4561003", email: "info@autopartespremium.com", city: "Santa Cruz", description: "Piezas premium para vehículos japenses y europeos" },
  { name: "Importadora Honda Bolivia", phone: "+591 4 4561004", email: "ventas@hondabolivia.com", city: "La Paz", description: "Representante oficial de repuestos Honda" },
  { name: "Mazda Parts Bolivia", phone: "+591 4 4561005", email: "contacto@mazdaparts.bo", city: "Cochabamba", description: "Repuestos originales y alternativos Mazda" },
  { name: "Repuestos Dongfeng", phone: "+591 4 4561006", email: "ventas@dongfeng.bo", city: "Santa Cruz", description: "Repuestos para vehículos chinos: Changan, BYD, Dongfeng" },
  { name: "Kia Hyundai Service", phone: "+591 4 4561007", email: "servicio@kiahyundai.bo", city: "La Paz", description: "Repuestos originales Kia e Hyundai coreanos" },
  { name: "Ford Parts Bolivia", phone: "+591 4 4561008", email: "parts@fordbolivia.bo", city: "Cochabamba", description: "Repuestos genuinos Ford Ranger y EcoSport" },
  { name: "Repuestos BrasilAuto", phone: "+591 3 4561009", email: "ventas@brasilauto.bo", city: "Santa Cruz", description: "Repuestos de origen brasileño para vehículos suramericanos" },
  { name: "European Parts S.A.", phone: "+591 2 4561010", email: "info@europeanparts.bo", city: "La Paz", description: "Repuestos europeos: BMW, Mercedes, Audi, Volkswagen" },
];

export async function seedData(prisma: PrismaClient) {
  console.log("=== Sembrando datos completos para dashboard ===");

  const admin = await prisma.user.findUnique({ where: { email: "admin@inventario.com" } });
  const tienda1 = await prisma.user.findUnique({ where: { email: "tienda1@inventario.com" } });
  const tienda2 = await prisma.user.findUnique({ where: { email: "tienda2@inventario.com" } });
  const tienda3 = await prisma.user.findUnique({ where: { email: "tienda3@inventario.com" } });
  const inventario = await prisma.user.findUnique({ where: { email: "inventario@inventario.com" } });

  if (!admin || !tienda1 || !tienda2 || !tienda3) {
    console.error("Faltan usuarios. Ejecuta el seed principal primero.");
    return;
  }

  const locs = await prisma.location.findMany();
  const alm1 = locs.find(l => l.name === "Almacén 1")!;
  const alm2 = locs.find(l => l.name === "Almacén 2")!;
  const alm3 = locs.find(l => l.name === "Almacén 3")!;
  const alm4 = locs.find(l => l.name === "Almacén 4")!;
  const ti1 = locs.find(l => l.name === "Tienda 1")!;
  const ti2 = locs.find(l => l.name === "Tienda 2")!;
  const ti3 = locs.find(l => l.name === "Tienda 3")!;
  const allLocs = [alm1, alm2, alm3, alm4, ti1, ti2, ti3];
  const tiendaUsers = [tienda1, tienda2, tienda3];
  const tiendaLocs = [ti1, ti2, ti3];

  const cats = await prisma.category.findMany();

  const products = productSeed;

  console.log("Creando productos...");
  const createdProducts = [];
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { itemCode: p.itemCode },
      update: {},
      create: {
        itemCode: p.itemCode,
        manufacturer: p.manufacturer,
        name: p.name,
        brand: p.brand,
        model: p.model,
        year: p.year,
        detail: p.detail,
        oemCode: p.oemCode,
        factoryCode: p.factoryCode,
        price1: p.price1,
        price2: p.price2,
        wholesalePrice: p.wholesalePrice,
        cost: p.cost,
        categoryId: cats.find(c => c.name === p.cat)?.id ?? null,
      },
    });
    createdProducts.push(product);
  }
  console.log(`${createdProducts.length} productos creados`);

  console.log("Creando inventario por ubicación...");
  const generateStock = (base: number): number[] => {
    return [
      base + Math.floor(Math.random() * 20),
      Math.floor(base * 0.3) + Math.floor(Math.random() * 10),
      Math.floor(base * 0.2) + Math.floor(Math.random() * 8),
      Math.floor(base * 0.15) + Math.floor(Math.random() * 5),
      Math.floor(base * 0.1) + Math.floor(Math.random() * 5),
      Math.floor(base * 0.05) + Math.floor(Math.random() * 3),
      Math.floor(base * 0.03) + Math.floor(Math.random() * 2),
    ];
  };

  const inventoryEntries: Array<{ productId: number; locationId: number; stock: number; minStock: number }> = [];
  for (const product of createdProducts) {
    const baseStock = product.name.includes("Filtro") ? 200 : product.name.includes("Bujía") ? 100 : product.name.includes("Pastilla") ? 60 : 20;
    const stocks = generateStock(baseStock);
    for (let i = 0; i < allLocs.length; i++) {
      inventoryEntries.push({ productId: product.id, locationId: allLocs[i].id, stock: stocks[i], minStock: Math.max(1, Math.floor(stocks[i] * 0.15)) });
    }
  }
  await prisma.inventory.createMany({ data: inventoryEntries, skipDuplicates: true });
  console.log("Inventario creado para todas las ubicaciones");

  const suppliers = suppliersSeed;
  await prisma.supplier.createMany({ data: suppliers, skipDuplicates: true });
  const createdSuppliers = await prisma.supplier.findMany();
  console.log(`${createdSuppliers.length} proveedores creados`);

  console.log("Creando clientes...");
  const customersData = customersSeed;
  await prisma.customer.createMany({ data: customersData, skipDuplicates: true });
  const createdCustomers = await prisma.customer.findMany();
  console.log(`${createdCustomers.length} clientes creados`);

  const now = new Date();
  const saleRecords = [];
  const existingNormalSales = await prisma.sale.count({ where: { type: "NORMAL" } });
  if (existingNormalSales === 0) {
  console.log("Creando ventas de los últimos 60 días...");
  const methods: Array<"EFECTIVO" | "QR" | "TRANSFERENCIA" | "CREDITO"> = ["EFECTIVO", "QR", "TRANSFERENCIA", "CREDITO"];

  for (let day = 0; day < 60; day++) {
    const numSales = Math.floor(Math.random() * 6) + 3;
    for (let s = 0; s < numSales; s++) {
      const user = tiendaUsers[Math.floor(Math.random() * 3)];
      const loc = tiendaLocs[Math.floor(Math.random() * 3)];
      const customer = createdCustomers[Math.floor(Math.random() * createdCustomers.length)];
      const numItems = Math.floor(Math.random() * 4) + 1;
      let total = 0;
      const itemsData = [];

      for (let it = 0; it < numItems; it++) {
        const prod = createdProducts[Math.floor(Math.random() * createdProducts.length)];
        const qty = Math.floor(Math.random() * 4) + 1;
        const price = Number(prod.price2);
        const sub = qty * price;
        total += sub;
        itemsData.push({ productId: prod.id, quantity: qty, unitPrice: price, subtotal: sub });
      }

      const saleDate = new Date(now);
      saleDate.setDate(saleDate.getDate() - day);
      saleDate.setHours(Math.floor(Math.random() * 12) + 7, Math.floor(Math.random() * 60));

      const numPayments = Math.random() < 0.3 ? 2 : 1;
      const paymentsData = [];
      let remaining = total;
      for (let p = 0; p < numPayments; p++) {
        const method = methods[Math.floor(Math.random() * methods.length)];
        const amount = p === numPayments - 1 ? remaining : Math.floor(total * (0.3 + Math.random() * 0.4));
        remaining -= amount;
        paymentsData.push({ method, amount: Math.max(0, amount), date: saleDate });
      }

      const sale = await prisma.sale.create({
        data: {
          saleDate,
          total,
          type: "NORMAL",
          userId: user.id,
          locationId: loc.id,
          customerId: customer.id,
          items: { create: itemsData },
          payments: { create: paymentsData },
        },
      });
      saleRecords.push(sale);
    }
    process.stdout.write(`\r  Día ${day + 1}/60...`);
  }
  console.log(`\n${saleRecords.length} ventas normales creadas`);
  } else {
    console.log(`Ventas normales ya existen (${existingNormalSales}); omitiendo generación demo.`);
  }

  console.log("Creando ventas por mayor...");
  const existingWholesaleSales = await prisma.sale.count({ where: { type: "MAYOR" } });
  let wholesaleCount = 0;
  if (existingWholesaleSales === 0) {
  for (let day = 0; day < 30; day++) {
    const numSales = Math.floor(Math.random() * 3) + 1;
    for (let s = 0; s < numSales; s++) {
      const loc = allLocs[Math.floor(Math.random() * 4)];
      const customer = createdCustomers[Math.floor(Math.random() * createdCustomers.length)];
      const numItems = Math.floor(Math.random() * 5) + 2;
      let total = 0;
      const itemsData = [];

      for (let it = 0; it < numItems; it++) {
        const prod = createdProducts[Math.floor(Math.random() * createdProducts.length)];
        const qty = Math.floor(Math.random() * 15) + 5;
        const price = Number(prod.wholesalePrice || prod.price1);
        const sub = qty * price;
        total += sub;
        itemsData.push({ productId: prod.id, quantity: qty, unitPrice: price, subtotal: sub });
      }

      const saleDate = new Date(now);
      saleDate.setDate(saleDate.getDate() - day);
      saleDate.setHours(Math.floor(Math.random() * 6) + 9);

      await prisma.sale.create({
        data: {
          saleDate,
          total,
          type: "MAYOR",
          userId: admin.id,
          locationId: loc.id,
          customerId: customer.id,
          items: { create: itemsData },
          payments: { create: { method: "TRANSFERENCIA", amount: total, date: saleDate } },
        },
      });
      wholesaleCount++;
    }
    process.stdout.write(`\r  Día ${day + 1}/30...`);
  }
  console.log(`\n${wholesaleCount} ventas por mayor creadas`);
  } else {
    console.log(`Ventas por mayor ya existen (${existingWholesaleSales}); omitiendo generación demo.`);
  }

  console.log("Creando movimientos...");
  const movementCount = 80;
  const existingMovements = await prisma.movement.count();
  if (existingMovements === 0) {
  for (let i = 0; i < movementCount; i++) {
    const fromIdx = Math.floor(Math.random() * 4);
    let toIdx = Math.floor(Math.random() * 3) + 4;
    if (toIdx === fromIdx) toIdx = (toIdx + 1) % 7;
    const prod = createdProducts[Math.floor(Math.random() * createdProducts.length)];
    const qty = Math.floor(Math.random() * 15) + 1;
    const date = new Date(now);
    date.setDate(date.getDate() - Math.floor(Math.random() * 60));
    date.setHours(Math.floor(Math.random() * 8) + 10);

    await prisma.movement.create({
      data: {
        productId: prod.id,
        fromLocationId: allLocs[fromIdx].id,
        toLocationId: allLocs[toIdx].id,
        quantity: qty,
        userId: inventario ? inventario.id : admin.id,
        date,
        observation: `Traslado de ${allLocs[fromIdx].name} a ${allLocs[toIdx].name}`,
      },
    });
  }
  console.log(`${movementCount} movimientos creados`);
  } else {
    console.log(`Movimientos ya existen (${existingMovements}); omitiendo demo.`);
  }

  console.log("Creando solicitudes de producto...");
  const requestStatuses: Array<"PENDIENTE" | "RECIBIDO_POR_INVENTARIO" | "PREPARANDO" | "ENTREGADO" | "RECIBIDO_POR_TIENDA" | "CANCELADO"> = ["PENDIENTE", "RECIBIDO_POR_INVENTARIO", "PREPARANDO", "ENTREGADO", "RECIBIDO_POR_TIENDA"];
  const existingRequests = await prisma.productRequest.count();
  if (existingRequests === 0) {
  for (let i = 0; i < 25; i++) {
    const prod = createdProducts[Math.floor(Math.random() * createdProducts.length)];
    const tiendaUser = tiendaUsers[Math.floor(Math.random() * 3)];
    const tiendaLoc = tiendaLocs[Math.floor(Math.random() * 3)];
    const date = new Date(now);
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));

    await prisma.productRequest.create({
      data: {
        productId: prod.id,
        quantity: Math.floor(Math.random() * 20) + 1,
        requestedById: tiendaUser.id,
        locationId: tiendaLoc.id,
        status: requestStatuses[Math.floor(Math.random() * requestStatuses.length)],
        date,
      },
    });
  }
  console.log("25 solicitudes creadas");
  } else {
    console.log(`Solicitudes ya existen (${existingRequests}); omitiendo demo.`);
  }

  console.log("Creando devoluciones...");
  const allSales = await prisma.sale.findMany({
    include: { items: true },
    orderBy: { saleDate: "desc" },
    take: 80,
  });
  const returnMethods: Array<"EFECTIVO" | "QR" | "TRANSFERENCIA" | "CREDITO"> = ["EFECTIVO", "QR", "TRANSFERENCIA"];
  let returnCount = 0;
  const existingReturns = await prisma.return.count();
  if (existingReturns === 0) {
  for (const sale of allSales) {
    if (sale.items.length === 0) continue;
    const shouldReturn = Math.random() < 0.12;
    if (!shouldReturn) continue;

    const returnItem = sale.items[Math.floor(Math.random() * sale.items.length)];
    const returnQty = Math.min(returnItem.quantity, Math.floor(Math.random() * 2) + 1);
    const returnAmount = returnQty * Number(returnItem.unitPrice);
    const returnDate = new Date(sale.saleDate);
    returnDate.setDate(returnDate.getDate() + Math.floor(Math.random() * 5) + 1);

    await prisma.return.create({
      data: {
        saleId: sale.id,
        productId: returnItem.productId,
        reason: ["Producto defectuoso", "No era el correcto", "Cliente se arrepintió", "Daño en transporte", "Garantía", "Error en pedido"][Math.floor(Math.random() * 6)],
        quantity: returnQty,
        amount: returnAmount,
        method: returnMethods[Math.floor(Math.random() * returnMethods.length)],
        date: returnDate,
      },
    });
    returnCount++;
  }
  console.log(`${returnCount} devoluciones creadas`);
  } else {
    console.log(`Devoluciones ya existen (${existingReturns}); omitiendo demo.`);
  }

  console.log("Creando costos con facturas...");
  let costCount = 0;
  const existingCosts = await prisma.cost.count();
  if (existingCosts === 0) {
  for (const product of createdProducts) {
    const numCosts = Math.floor(Math.random() * 3) + 1;
    for (let c = 0; c < numCosts; c++) {
      const supplier = createdSuppliers[Math.floor(Math.random() * createdSuppliers.length)];
      const costDate = new Date(now);
      costDate.setDate(costDate.getDate() - Math.floor(Math.random() * 120));
      const baseCost = Number(product.cost || product.price1) * (0.65 + Math.random() * 0.35);
      const exchangeRate = 6.90 + (Math.random() * 0.12 - 0.06);

      await prisma.cost.create({
        data: {
          productId: product.id,
          supplierId: supplier.id,
          exchangeRate: Number(exchangeRate.toFixed(2)),
          costPrice: Number(baseCost.toFixed(2)),
          percentage: [8, 12, 15, 20, 25][Math.floor(Math.random() * 5)],
          date: costDate,
        },
      });
      costCount++;
    }
  }
  console.log(`${costCount} costos creados`);
  } else {
    console.log(`Costos ya existen (${existingCosts}); omitiendo demo.`);
  }

  console.log("Asociando productos con importadoras y calidades...");
  const importersData = importersSeed;
  const createdImporters = [];
  const existingImporters = await prisma.importer.count();
  if (existingImporters === 0) {
  for (const imp of importersData) {
    const importer = await prisma.importer.create({ data: imp });
    createdImporters.push(importer);
  }
  console.log(`${createdImporters.length} importadoras creadas`);

  const productImporterData: Array<{ productId: number; importerId: number }> = [];
  for (const product of createdProducts) {
    const numImporters = Math.floor(Math.random() * 3) + 1;
    const shuffled = [...createdImporters].sort(() => Math.random() - 0.5);
    for (let i = 0; i < numImporters; i++) {
      productImporterData.push({ productId: product.id, importerId: shuffled[i].id });
    }
  }
  await prisma.productImporter.createMany({ data: productImporterData, skipDuplicates: true });
  console.log("Productos asociados con importadoras");
  } else {
    console.log(`Importadoras ya existen (${existingImporters}); omitiendo asociación demo.`);
  }

  console.log("\n=== Datos sembrados correctamente ===");
  console.log(`  - ${createdProducts.length} productos (50+ categorías)`);
  console.log(`  - ${createdCustomers.length} clientes`);
  console.log(`  - ${createdSuppliers.length} proveedores`);
  console.log(`  - ${createdImporters.length} importadoras`);
  console.log(`  - ${saleRecords.length} ventas normales (60 días)`);
  console.log(`  - ${wholesaleCount} ventas por mayor`);
  console.log(`  - ${movementCount} movimientos`);
  console.log(`  - 25 solicitudes`);
  console.log(`  - ${returnCount} devoluciones`);
  console.log(`  - ${costCount} costos con facturas`);
}
