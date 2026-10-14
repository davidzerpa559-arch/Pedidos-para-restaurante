import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const databasePath =
  process.env.SQLITE_DB_PATH ??
  path.resolve(process.cwd(), "data/database.sqlite");

mkdirSync(path.dirname(databasePath), { recursive: true });

export const restaurantDb = new Database(databasePath);

restaurantDb.pragma("journal_mode = WAL");
restaurantDb.pragma("foreign_keys = ON");
restaurantDb.pragma("busy_timeout = 5000");

restaurantDb.exec(`
  CREATE TABLE IF NOT EXISTS configuracion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nombre_negocio TEXT NOT NULL,
    logo_url TEXT NOT NULL DEFAULT '',
    rif TEXT NOT NULL DEFAULT '',
    direccion TEXT NOT NULL DEFAULT '',
    telefono_ws TEXT NOT NULL DEFAULT '',
    banco TEXT NOT NULL DEFAULT '',
    cedula_pago TEXT NOT NULL DEFAULT '',
    telefono_pago TEXT NOT NULL DEFAULT '',
    estado_local INTEGER NOT NULL DEFAULT 0,
    horario TEXT NOT NULL DEFAULT 'Horario por configurar',
    exchange_rate REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    categoria TEXT NOT NULL,
    precio REAL NOT NULL CHECK (precio > 0),
    precio_oferta REAL CHECK (precio_oferta IS NULL OR precio_oferta > 0),
    foto_url TEXT NOT NULL DEFAULT '',
    disponible INTEGER NOT NULL DEFAULT 1,
    likes_count INTEGER NOT NULL DEFAULT 0,
    fecha_creacion TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nombre TEXT NOT NULL,
    cliente_cedula TEXT NOT NULL,
    cliente_telefono TEXT NOT NULL,
    cliente_direccion TEXT NOT NULL,
    items_json TEXT NOT NULL,
    total_usd REAL NOT NULL,
    total_bs REAL NOT NULL,
    referencia_6_digitos TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    tracking_token_hash TEXT NOT NULL UNIQUE,
    fecha_creacion TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resenas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    cliente_nombre TEXT NOT NULL,
    comentario TEXT NOT NULL,
    calificacion INTEGER NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    fecha TEXT NOT NULL,
    UNIQUE (producto_id, pedido_id)
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    visitor_hash TEXT NOT NULL,
    fecha TEXT NOT NULL,
    UNIQUE (producto_id, visitor_hash)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS pedidos_pending_reference
    ON pedidos(referencia_6_digitos)
    WHERE estado = 'PENDIENTE';
  CREATE INDEX IF NOT EXISTS pedidos_created_at ON pedidos(fecha_creacion);
  CREATE INDEX IF NOT EXISTS pedidos_status ON pedidos(estado);
  CREATE INDEX IF NOT EXISTS productos_category ON productos(categoria);
`);

const now = new Date().toISOString();
restaurantDb
  .prepare(
    `INSERT OR IGNORE INTO configuracion
      (id, nombre_negocio, logo_url, rif, direccion, telefono_ws, banco,
       cedula_pago, telefono_pago, estado_local, horario, exchange_rate, updated_at)
     VALUES (1, ?, '', '', '', '', '', '', '', 0, ?, 0, ?)`,
  )
  .run("Sazón del Puerto", "Horario por configurar", now);

const productCount = restaurantDb
  .prepare("SELECT COUNT(*) AS count FROM productos")
  .get() as { count: number };

if (productCount.count === 0) {
  const addProduct = restaurantDb.prepare(
    `INSERT INTO productos
      (nombre, descripcion, categoria, precio, precio_oferta, foto_url, disponible, fecha_creacion)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );

  const seed = restaurantDb.transaction(() => {
    addProduct.run(
      "Pescado frito porteño",
      "Pargo frito al punto, con tostones crujientes, ensalada fresca y limón.",
      "Del mar",
      14.5,
      null,
      "/images/pescado-frito.jpg",
      now,
    );
    addProduct.run(
      "Cachapa con queso",
      "Cachapa dorada de maíz tierno, rellena de queso blanco fresco.",
      "Tradicionales",
      8.5,
      null,
      "/images/cachapa.jpg",
      now,
    );
    addProduct.run(
      "Arepa reina pepiada",
      "Arepa asada rellena de pollo mechado cremoso con aguacate.",
      "Arepas",
      6,
      null,
      "/images/arepa-reina-pepiada.jpg",
      now,
    );
  });

  seed();
}

export interface ConfigRow {
  id: number;
  nombre_negocio: string;
  logo_url: string;
  rif: string;
  direccion: string;
  telefono_ws: string;
  banco: string;
  cedula_pago: string;
  telefono_pago: string;
  estado_local: number;
  horario: string;
  exchange_rate: number;
  updated_at: string;
}

export interface ProductRow {
  id: number;
  nombre: string;
  descripcion: string;
  categoria: string;
  precio: number;
  precio_oferta: number | null;
  foto_url: string;
  disponible: number;
  likes_count: number;
  fecha_creacion: string;
}

export interface OrderRow {
  id: number;
  cliente_nombre: string;
  cliente_cedula: string;
  cliente_telefono: string;
  cliente_direccion: string;
  items_json: string;
  total_usd: number;
  total_bs: number;
  referencia_6_digitos: string;
  estado: string;
  tracking_token_hash: string;
  fecha_creacion: string;
  updated_at: string;
}

export interface ReviewRow {
  id: number;
  producto_id: number;
  pedido_id: number;
  cliente_nombre: string;
  comentario: string;
  calificacion: number;
  fecha: string;
}

export interface OrderLineRecord {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export function getConfigRow(): ConfigRow {
  return restaurantDb
    .prepare("SELECT * FROM configuracion WHERE id = 1")
    .get() as ConfigRow;
}

export function mapProduct(row: ProductRow) {
  return {
    id: row.id,
    name: row.nombre,
    description: row.descripcion,
    category: row.categoria,
    price: row.precio,
    offerPrice: row.precio_oferta,
    photoUrl: row.foto_url,
    available: row.disponible === 1,
    likesCount: row.likes_count,
    createdAt: row.fecha_creacion,
  };
}

export function mapReview(row: ReviewRow) {
  return {
    id: row.id,
    productId: row.producto_id,
    customerName: row.cliente_nombre,
    comment: row.comentario,
    rating: row.calificacion,
    createdAt: row.fecha,
  };
}

export function mapOrderLines(itemsJson: string): OrderLineRecord[] {
  return JSON.parse(itemsJson) as OrderLineRecord[];
}

export function mapOrderStatus(row: OrderRow) {
  return {
    id: row.id,
    status: row.estado,
    totalUsd: row.total_usd,
    totalBs: row.total_bs,
    items: mapOrderLines(row.items_json),
    createdAt: row.fecha_creacion,
    updatedAt: row.updated_at,
  };
}

export function mapAdminOrder(row: OrderRow) {
  return {
    ...mapOrderStatus(row),
    customerName: row.cliente_nombre,
    customerId: row.cliente_cedula,
    phone: row.cliente_telefono,
    address: row.cliente_direccion,
    paymentReference: row.referencia_6_digitos,
  };
}
