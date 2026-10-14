import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  GetStoreResponse,
  ListProductReviewsParams,
  ListProductReviewsResponse,
  ListProductsQueryParams,
  ListProductsResponse,
  ToggleProductLikeBody,
  ToggleProductLikeParams,
  ToggleProductLikeResponse,
} from "@workspace/api-zod";
import {
  getConfigRow,
  mapProduct,
  mapReview,
  restaurantDb,
  type ProductRow,
  type ReviewRow,
} from "../lib/restaurant-db";

const router: IRouter = Router();

function isWithinDailySchedule(schedule: string): boolean {
  const match = schedule.match(
    /^\s*(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*$/,
  );
  if (!match) return false;

  const [, openHourText, openMinuteText, closeHourText, closeMinuteText] =
    match;
  const openHour = Number(openHourText);
  const openMinute = Number(openMinuteText);
  const closeHour = Number(closeHourText);
  const closeMinute = Number(closeMinuteText);
  if (
    openHour > 23 ||
    closeHour > 23 ||
    openMinute > 59 ||
    closeMinute > 59
  ) {
    return false;
  }

  const openAt = openHour * 60 + openMinute;
  const closeAt = closeHour * 60 + closeMinute;
  const caracas = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const now = caracas.getUTCHours() * 60 + caracas.getUTCMinutes();

  if (openAt === closeAt) return false;
  return openAt < closeAt
    ? now >= openAt && now < closeAt
    : now >= openAt || now < closeAt;
}

export function publicStoreDetails() {
  const config = getConfigRow();
  const manualOpen = config.estado_local === 1;
  return GetStoreResponse.parse({
    name: config.nombre_negocio,
    logoUrl: config.logo_url,
    rif: config.rif,
    address: config.direccion,
    whatsapp: config.telefono_ws,
    bank: config.banco,
    paymentId: config.cedula_pago,
    paymentPhone: config.telefono_pago,
    exchangeRate: config.exchange_rate,
    isOpen: manualOpen || isWithinDailySchedule(config.horario),
    manualOpen,
    hours: config.horario,
    schedule: config.horario,
    paymentConfigured: Boolean(
      config.banco.trim() &&
        config.cedula_pago.trim() &&
        config.telefono_pago.trim(),
    ),
  });
}

router.get("/store", (_req, res) => {
  res.json(publicStoreDetails());
});

router.get("/products", (req, res) => {
  const parsedQuery = ListProductsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const { category, search } = parsedQuery.data;
  const conditions = ["disponible = 1"];
  const values: string[] = [];

  if (category?.trim()) {
    conditions.push("LOWER(categoria) = LOWER(?)");
    values.push(category.trim());
  }
  if (search?.trim()) {
    conditions.push("(LOWER(nombre) LIKE ? OR LOWER(descripcion) LIKE ?)");
    const term = `%${search.trim().toLowerCase()}%`;
    values.push(term, term);
  }

  const rows = restaurantDb
    .prepare(
      `SELECT * FROM productos WHERE ${conditions.join(" AND ")}
       ORDER BY fecha_creacion DESC, id DESC`,
    )
    .all(...values) as ProductRow[];

  res.json(ListProductsResponse.parse(rows.map(mapProduct)));
});

router.get("/products/:id/reviews", (req, res) => {
  const params = ListProductReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = restaurantDb
    .prepare(
      `SELECT * FROM resenas WHERE producto_id = ?
       ORDER BY fecha DESC, id DESC LIMIT 50`,
    )
    .all(params.data.id) as ReviewRow[];

  res.json(ListProductReviewsResponse.parse(rows.map(mapReview)));
});

router.post("/products/:id/like", (req, res) => {
  const params = ToggleProductLikeParams.safeParse(req.params);
  const body = ToggleProductLikeBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.success
        ? (body.error?.message ?? "Solicitud inválida.")
        : params.error.message,
    });
    return;
  }

  const product = restaurantDb
    .prepare("SELECT id FROM productos WHERE id = ?")
    .get(params.data.id);
  if (!product) {
    res.status(404).json({ error: "No encontramos ese producto." });
    return;
  }

  const visitorHash = createHash("sha256")
    .update(body.data.visitorId)
    .digest("hex");
  const toggleLike = restaurantDb.transaction(() => {
    const existing = restaurantDb
      .prepare(
        "SELECT id FROM likes WHERE producto_id = ? AND visitor_hash = ?",
      )
      .get(params.data.id, visitorHash) as { id: number } | undefined;

    if (existing) {
      restaurantDb.prepare("DELETE FROM likes WHERE id = ?").run(existing.id);
      restaurantDb
        .prepare(
          "UPDATE productos SET likes_count = MAX(0, likes_count - 1) WHERE id = ?",
        )
        .run(params.data.id);
      return false;
    }

    restaurantDb
      .prepare(
        `INSERT INTO likes (producto_id, visitor_hash, fecha)
         VALUES (?, ?, ?)`,
      )
      .run(params.data.id, visitorHash, new Date().toISOString());
    restaurantDb
      .prepare("UPDATE productos SET likes_count = likes_count + 1 WHERE id = ?")
      .run(params.data.id);
    return true;
  });

  const liked = toggleLike();
  const count = restaurantDb
    .prepare("SELECT likes_count FROM productos WHERE id = ?")
    .get(params.data.id) as { likes_count: number };

  res.json(
    ToggleProductLikeResponse.parse({
      liked,
      likesCount: count.likes_count,
    }),
  );
});

export default router;
