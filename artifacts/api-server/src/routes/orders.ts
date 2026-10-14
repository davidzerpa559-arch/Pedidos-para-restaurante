import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CreateOrderBody,
  CreateOrderResponse,
  CreateOrderReviewBody,
  CreateOrderReviewParams,
  CreateOrderReviewResponse,
  GetTrackedOrderStatusParams,
  GetTrackedOrderStatusQueryParams,
  GetTrackedOrderStatusResponse,
  ReceiveMobilePaymentBody,
  ReceiveMobilePaymentQueryParams,
  ReceiveMobilePaymentResponse,
} from "@workspace/api-zod";
import {
  getConfigRow,
  mapOrderLines,
  mapOrderStatus,
  restaurantDb,
  type OrderRow,
  type ProductRow,
} from "../lib/restaurant-db";
import { constantTimeEqual } from "../lib/admin-auth";
import { publicStoreDetails } from "./store";

const router: IRouter = Router();
const REVIEWABLE_STATUSES = new Set([
  "APROBADO",
  "EN_PREPARACION",
  "DESPACHADO",
  "ENTREGADO",
]);

function hashTrackingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function lastSixDigits(value: string): string | undefined {
  const candidates = value.match(/\d{6,}/g);
  const candidate = candidates?.[0];
  return candidate?.slice(-6);
}

router.post("/orders", (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!/^[VEve]-?[0-9]{5,10}$/.test(parsed.data.customerId.trim())) {
    res.status(400).json({
      error: "Escribe una cédula venezolana que comience con V- o E-.",
    });
    return;
  }

  const store = publicStoreDetails();
  if (!store.isOpen) {
    res.status(409).json({ error: "El local está cerrado en este momento." });
    return;
  }
  if (!store.paymentConfigured || store.exchangeRate <= 0) {
    res.status(409).json({
      error:
        "El restaurante aún debe configurar sus datos de Pago Móvil y la tasa de cambio.",
    });
    return;
  }

  const quantities = new Map<number, number>();
  for (const item of parsed.data.items) {
    const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (quantity > 20) {
      res.status(400).json({ error: "La cantidad máxima por producto es 20." });
      return;
    }
    quantities.set(item.productId, quantity);
  }

  const lines: ReturnType<typeof mapOrderLines> = [];
  for (const [productId, quantity] of quantities) {
    const product = restaurantDb
      .prepare("SELECT * FROM productos WHERE id = ?")
      .get(productId) as ProductRow | undefined;
    if (!product || product.disponible !== 1) {
      res.status(409).json({
        error: "Uno de los productos ya no está disponible. Actualiza el menú.",
      });
      return;
    }

    const unitPrice = product.precio_oferta ?? product.precio;
    const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
    lines.push({
      productId,
      name: product.nombre,
      quantity,
      unitPrice,
      lineTotal,
    });
  }

  const totalUsd =
    Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) /
    100;
  const totalBs = Math.round(totalUsd * store.exchangeRate * 100) / 100;
  const existingReference = restaurantDb
    .prepare(
      "SELECT id FROM pedidos WHERE referencia_6_digitos = ? AND estado = 'PENDIENTE'",
    )
    .get(parsed.data.paymentReference);
  if (existingReference) {
    res.status(409).json({
      error:
        "Ya hay un pedido pendiente con esos últimos 6 dígitos. Verifica la referencia del pago.",
    });
    return;
  }

  const trackingToken = randomBytes(32).toString("base64url");
  const tokenHash = hashTrackingToken(trackingToken);
  const now = new Date().toISOString();

  try {
    const insert = restaurantDb
      .prepare(
        `INSERT INTO pedidos
          (cliente_nombre, cliente_cedula, cliente_telefono, cliente_direccion,
           items_json, total_usd, total_bs, referencia_6_digitos, estado,
           tracking_token_hash, fecha_creacion, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)`,
      )
      .run(
        parsed.data.customerName.trim(),
        parsed.data.customerId.trim().toUpperCase(),
        parsed.data.phone.trim(),
        parsed.data.address.trim(),
        JSON.stringify(lines),
        totalUsd,
        totalBs,
        parsed.data.paymentReference,
        tokenHash,
        now,
        now,
      );

    res.status(201).json(
      CreateOrderResponse.parse({
        id: Number(insert.lastInsertRowid),
        trackingToken,
        status: "PENDIENTE",
        totalUsd,
        totalBs,
        items: lines,
        createdAt: now,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not create order");
    res.status(409).json({
      error:
        "No se pudo registrar la referencia. Comprueba los últimos 6 dígitos e inténtalo de nuevo.",
    });
  }
});

router.get("/orders/:id/status", (req, res) => {
  const params = GetTrackedOrderStatusParams.safeParse(req.params);
  const query = GetTrackedOrderStatusQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({
      error: params.success
        ? (query.error?.message ?? "Solicitud inválida.")
        : params.error.message,
    });
    return;
  }

  const row = restaurantDb
    .prepare("SELECT * FROM pedidos WHERE id = ? AND tracking_token_hash = ?")
    .get(params.data.id, hashTrackingToken(query.data.token)) as
    | OrderRow
    | undefined;
  if (!row) {
    res.status(404).json({ error: "No encontramos ese pedido." });
    return;
  }

  res.json(GetTrackedOrderStatusResponse.parse(mapOrderStatus(row)));
});

router.post("/orders/:id/reviews", (req, res) => {
  const params = CreateOrderReviewParams.safeParse(req.params);
  const body = CreateOrderReviewBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.success
        ? (body.error?.message ?? "Solicitud inválida.")
        : params.error.message,
    });
    return;
  }

  const order = restaurantDb
    .prepare("SELECT * FROM pedidos WHERE id = ? AND tracking_token_hash = ?")
    .get(params.data.id, hashTrackingToken(body.data.trackingToken)) as
    | OrderRow
    | undefined;
  if (!order || !REVIEWABLE_STATUSES.has(order.estado)) {
    res.status(403).json({
      error: "Solo puedes reseñar un pedido cuyo pago fue confirmado.",
    });
    return;
  }

  const orderItems = mapOrderLines(order.items_json);
  if (!orderItems.some((item) => item.productId === body.data.productId)) {
    res.status(403).json({
      error: "Ese producto no forma parte del pedido confirmado.",
    });
    return;
  }

  const now = new Date().toISOString();
  try {
    const result = restaurantDb
      .prepare(
        `INSERT INTO resenas
          (producto_id, pedido_id, cliente_nombre, comentario, calificacion, fecha)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.data.productId,
        order.id,
        order.cliente_nombre,
        body.data.comment.trim(),
        body.data.rating,
        now,
      );

    res.status(201).json(
      CreateOrderReviewResponse.parse({
        id: Number(result.lastInsertRowid),
        productId: body.data.productId,
        customerName: order.cliente_nombre,
        comment: body.data.comment.trim(),
        rating: body.data.rating,
        createdAt: now,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not save order review");
    res.status(409).json({ error: "Ya enviaste una reseña para este producto." });
  }
});

router.post("/webhooks/pago-movil", (req, res) => {
  const query = ReceiveMobilePaymentQueryParams.safeParse(req.query);
  const body = ReceiveMobilePaymentBody.safeParse(req.body);
  if (!query.success || !body.success) {
    res.status(400).json({
      error: query.success
        ? (body.error?.message ?? "Solicitud inválida.")
        : query.error.message,
    });
    return;
  }

  const expectedToken = process.env.MACRODROID_WEBHOOK_TOKEN;
  if (!expectedToken) {
    res.status(503).json({ error: "El webhook no está configurado." });
    return;
  }

  const providedToken = req.header("x-webhook-token") ?? query.data.token ?? "";
  if (!constantTimeEqual(expectedToken, providedToken)) {
    res.status(401).json({ error: "Token de webhook inválido." });
    return;
  }

  const reference = lastSixDigits(body.data.reference);
  if (!reference) {
    res.status(400).json({
      error: "La notificación debe incluir una referencia con al menos 6 dígitos.",
    });
    return;
  }

  const order = restaurantDb
    .prepare(
      `SELECT * FROM pedidos
       WHERE referencia_6_digitos = ? AND estado = 'PENDIENTE'
       LIMIT 1`,
    )
    .get(reference) as OrderRow | undefined;

  if (!order) {
    res.json(
      ReceiveMobilePaymentResponse.parse({
        matched: false,
        orderId: null,
        status: null,
      }),
    );
    return;
  }

  const now = new Date().toISOString();
  restaurantDb
    .prepare(
      `UPDATE pedidos SET estado = 'APROBADO', updated_at = ?
       WHERE id = ? AND estado = 'PENDIENTE'`,
    )
    .run(now, order.id);

  res.json(
    ReceiveMobilePaymentResponse.parse({
      matched: true,
      orderId: order.id,
      status: "APROBADO",
    }),
  );
});

export default router;
