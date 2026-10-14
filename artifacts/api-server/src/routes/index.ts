import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import healthRouter from "./health";
import ordersRouter from "./orders";
import storeRouter from "./store";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storeRouter);
router.use(ordersRouter);
router.use(adminRouter);

export default router;
