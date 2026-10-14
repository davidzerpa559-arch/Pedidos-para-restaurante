import { Router, type IRouter, type Request } from "express";
import {
  CreateAdminSessionBody,
  CreateAdminSessionResponse,
  DeleteProductParams,
  DeleteProductResponse,
  GetAdminDashboardResponse,
  GetAdminSessionResponse,
  GetAdminStoreResponse,
  ListAdminOrdersQueryParams,
  ListAdminOrdersResponse,
  ListAdminProductsResponse,
  UpdateAdminStoreBody,
  UpdateAdminStoreResponse,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  UpdateOrderStatusResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
  CreateProductBody,
  CreateProductResponse,
  EndAdminSessionResponse,
} from "@workspace/api-zod";
import {
  clearAdminSession,
  constantTimeEqual,
  isAdminSessionValid,
  issueAdminSession,
  requireAdminSession,
} from "../lib/admin-auth";
import {
  getConfigRow,
  mapAdminOrder,
  mapProduct,
  restaurantDb,
  type OrderRow,
  type ProductRow,
} from "../lib/restaurant-db";
import { publicStoreDetails } from "./store";

const router: IRouter = Router();
const VALID_ORDER_STATUSES = [
  "PENDIENTE",
  "APROBADO",
  "EN_PREPARACION",
  "DESPACHADO",
  "ENTREGADO",
  "CANCELADO",
] as const;
const acceptedRevenueStatuses = [
  "APROBADO",
  "EN_PREPARACION",
  "DESPACHADO",
  "ENTREGADO",
];
const attemptsByIp = new Map<string, { count: number; startedAt: number }>();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function registerFailedAttempt(ip: string): number {
  const now = Date.now();
  const previous = attemptsByIp.get(ip);
  const next =
    !previous || now - previous.startedAt > ATTEMPT_WINDOW_MS
      ? { count: 1, startedAt: now }
      : { count: previous.count + 1, startedAt: previous.startedAt };
  attemptsByIp.set(ip, next);

  if (attemptsByIp.size > 2000) {
    for (const [key, entry] of attemptsByIp) {
      if (now - entry.startedAt > ATTEMPT_WINDOW_MS) attemptsByIp.delete(key);
    }
  }

  return Math.max(
    0,
    Math.ceil((ATTEMPT_WINDOW_MS - (now - next.startedAt)) / 1000),
  );
}

router.get("/admin/session", (req, res) => {
  res.json(
    GetAdminSessionResponse.parse({
      authenticated: isAdminSessionValid(req),
    }),
  );
});

router.post("/admin/session", (req, res) => {
  const ip = clientIp(req);
  const attempt = attemptsByIp.get(ip);
  if (attempt && attempt.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.max(
      1,
      Math.ceil(
        (ATTEMPT_WINDOW_MS - (Date.now() - attempt.startedAt)) / 1000,
      ),
    );
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
    });
    return;
  }

  const parsed = CreateAdminSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const configuredPin = process.env.ADMIN_PIN;
  if (!configuredPin || !process.env.SESSION_SECRET) {
    res.status(503).json({
      error: "La administración no está configurada en el servidor.",
    });
    return;
  }

  if (!constantTimeEqual(configuredPin, parsed.data.pin)) {
    const retryAfter = registerFailedAttempt(ip);
    if ((attemptsByIp.get(ip)?.count ?? 0) >= MAX_ATTEMPTS) {
      res.setHeader("Retry-After", String(retryAfter));
    }
    req.log.warn("Invalid admin PIN attempt");
    res.status(401).json({ error: "PIN incorrecto." });
    return;
  }

  attemptsByIp.delete(ip);
  if (!issueAdminSession(res)) {
    res.status(503).json({
      error: "No se pudo iniciar la sesión de administración.",
    });
    return;
  }

  res.json(CreateAdminSessionResponse.parse({ authenticated: true }));
});

router.delete("/admin/session", (_req, res) => {
  clearAdminSession(res);
  res.json(EndAdminSessionResponse.parse({ success: true }));
});

router.use("/admin", requireAdminSession);

router.get("/admin/dashboard", (_req, res) => {
  const caracasLocal = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const year = caracasLocal.getUTCFullYear();
  const month = caracasLocal.getUTCMonth();
  const date = caracasLocal.getUTCDate();
  const mondayOffset = (caracasLocal.getUTCDay() + 6) % 7;

  const asUtcStart = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m, d) + 4 * 60 * 60 * 1000).toISOString();
  const todayStart = asUtcStart(year, month, date);
  const weekStart = asUtcStart(year, month, date - mondayOffset);
  const monthStart = asUtcStart(year, month, 1);

  const period = (start: string) =>
    restaurantDb
      .prepare(
        `SELECT COUNT(*) AS orders,
          COALESCE(SUM(CASE WHEN estado IN (?, ?, ?, ?) THEN total_usd ELSE 0 END), 0)
            AS revenue_usd
         FROM pedidos WHERE fecha_creacion >= ?`,
      )
      .get(...acceptedRevenueStatuses, start) as {
      orders: number;
      revenue_usd: number;
    };
  const countStatuses = restaurantDb
    .prepare("SELECT estado, COUNT(*) AS count FROM pedidos GROUP BY estado")
    .all() as Array<{ estado: string; count: number }>;
  const counts = new Map(countStatuses.map((row) => [row.estado, row.count]));

  res.json(
    GetAdminDashboardResponse.parse({
      today: {
        orders: period(todayStart).orders,
        revenueUsd: period(todayStart).revenue_usd,
      },
      week: {
        orders: period(weekStart).orders,
        revenueUsd: period(weekStart).revenue_usd,
      },
      month: {
        orders: period(monthStart).orders,
        revenueUsd: period(monthStart).revenue_usd,
      },
      statusCounts: {
        pending: counts.get("PENDIENTE") ?? 0,
        approved: counts.get("APROBADO") ?? 0,
        preparing: counts.get("EN_PREPARACION") ?? 0,
        dispatched: counts.get("DESPACHADO") ?? 0,
        delivered: counts.get("ENTREGADO") ?? 0,
        cancelled: counts.get("CANCELADO") ?? 0,
      },
    }),
  );
});

router.get("/admin/orders", (req, res) => {
  const query = ListAdminOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const status = query.data.status;
  if (status && !VALID_ORDER_STATUSES.includes(status as (typeof VALID_ORDER_STATUSES)[number])) {
    res.status(400).json({ error: "Estado de pedido inválido." });
    return;
  }

  const rows = status
    ? (restaurantDb
        .prepare(
          `SELECT * FROM pedidos WHERE estado = ?
           ORDER BY fecha_creacion DESC, id DESC LIMIT 100`,
        )
        .all(status) as OrderRow[])
    : (restaurantDb
        .prepare(
          `SELECT * FROM pedidos
           ORDER BY fecha_creacion DESC, id DESC LIMIT 100`,
        )
        .all() as OrderRow[]);

  res.json(ListAdminOrdersResponse.parse(rows.map(mapAdminOrder)));
});

router.patch("/admin/orders/:id/status", (req, res) => {
  const params = UpdateOrderStatusParams.safeParse(req.params);
  const body = UpdateOrderStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.success
        ? (body.error?.message ?? "Solicitud inválida.")
        : params.error.message,
    });
    return;
  }

  const now = new Date().toISOString();
  restaurantDb
    .prepare("UPDATE pedidos SET estado = ?, updated_at = ? WHERE id = ?")
    .run(body.data.status, now, params.data.id);

  const updated = restaurantDb
    .prepare("SELECT * FROM pedidos WHERE id = ?")
    .get(params.data.id) as OrderRow | undefined;
  if (!updated) {
    res.status(404).json({ error: "No encontramos ese pedido." });
    return;
  }

  res.json(UpdateOrderStatusResponse.parse(mapAdminOrder(updated)));
});

router.get("/admin/products", (_req, res) => {
  const rows = restaurantDb
    .prepare("SELECT * FROM productos ORDER BY fecha_creacion DESC, id DESC")
    .all() as ProductRow[];
  res.json(ListAdminProductsResponse.parse(rows.map(mapProduct)));
});

router.post("/admin/products", (req, res) => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date().toISOString();
  const result = restaurantDb
    .prepare(
      `INSERT INTO productos
        (nombre, descripcion, categoria, precio, precio_oferta, foto_url,
         disponible, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      parsed.data.name.trim(),
      parsed.data.description.trim(),
      parsed.data.category.trim(),
      parsed.data.price,
      parsed.data.offerPrice ?? null,
      parsed.data.photoUrl.trim(),
      parsed.data.available ? 1 : 0,
      now,
    );

  const product = restaurantDb
    .prepare("SELECT * FROM productos WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as ProductRow;
  res.status(201).json(CreateProductResponse.parse(mapProduct(product)));
});

router.patch("/admin/products/:id", (req, res) => {
  const params = UpdateProductParams.safeParse(req.params);
  const body = UpdateProductBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.success
        ? (body.error?.message ?? "Solicitud inválida.")
        : params.error.message,
    });
    return;
  }

  const existing = restaurantDb
    .prepare("SELECT * FROM productos WHERE id = ?")
    .get(params.data.id) as ProductRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "No encontramos ese producto." });
    return;
  }

  const next = {
    name: body.data.name?.trim() ?? existing.nombre,
    description: body.data.description?.trim() ?? existing.descripcion,
    category: body.data.category?.trim() ?? existing.categoria,
    price: body.data.price ?? existing.precio,
    offerPrice:
      body.data.offerPrice === undefined
        ? existing.precio_oferta
        : body.data.offerPrice,
    photoUrl: body.data.photoUrl?.trim() ?? existing.foto_url,
    available:
      body.data.available === undefined
        ? existing.disponible
        : body.data.available
          ? 1
          : 0,
  };

  restaurantDb
    .prepare(
      `UPDATE productos SET nombre = ?, descripcion = ?, categoria = ?,
        precio = ?, precio_oferta = ?, foto_url = ?, disponible = ?
       WHERE id = ?`,
    )
    .run(
      next.name,
      next.description,
      next.category,
      next.price,
      next.offerPrice,
      next.photoUrl,
      next.available,
      params.data.id,
    );

  const updated = restaurantDb
    .prepare("SELECT * FROM productos WHERE id = ?")
    .get(params.data.id) as ProductRow;
  res.json(UpdateProductResponse.parse(mapProduct(updated)));
});

router.delete("/admin/products/:id", (req, res) => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = restaurantDb
    .prepare("DELETE FROM productos WHERE id = ?")
    .run(params.data.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "No encontramos ese producto." });
    return;
  }

  res.json(DeleteProductResponse.parse({ success: true }));
});

router.get("/admin/store", (_req, res) => {
  res.json(GetAdminStoreResponse.parse(publicStoreDetails()));
});

router.put("/admin/store", (req, res) => {
  const body = UpdateAdminStoreBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  restaurantDb
    .prepare(
      `UPDATE configuracion SET nombre_negocio = ?, logo_url = ?, rif = ?,
        direccion = ?, telefono_ws = ?, banco = ?, cedula_pago = ?,
        telefono_pago = ?, exchange_rate = ?, estado_local = ?, horario = ?,
        updated_at = ?
       WHERE id = 1`,
    )
    .run(
      body.data.name.trim(),
      body.data.logoUrl.trim(),
      body.data.rif.trim(),
      body.data.address.trim(),
      body.data.whatsapp.trim(),
      body.data.bank.trim(),
      body.data.paymentId.trim(),
      body.data.paymentPhone.trim(),
      body.data.exchangeRate,
      body.data.manualOpen ? 1 : 0,
      body.data.schedule.trim(),
      new Date().toISOString(),
    );

  const config = getConfigRow();
  if (!config) {
    res.status(500).json({ error: "No se pudo leer la configuración guardada." });
    return;
  }

  res.json(UpdateAdminStoreResponse.parse(publicStoreDetails()));
});

export default router;
