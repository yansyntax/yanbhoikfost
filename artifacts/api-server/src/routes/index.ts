import { Router, type IRouter } from "express";
import healthRouter from "./health";
import signalsRouter from "./signals";
import analysisRouter from "./analysis";

const router: IRouter = Router();

router.use(healthRouter);
router.use(signalsRouter);
router.use(analysisRouter);

export default router;
