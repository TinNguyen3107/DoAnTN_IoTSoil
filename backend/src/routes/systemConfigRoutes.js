import { Router } from 'express';
import { SystemConfigController } from '../controllers/systemConfigController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new SystemConfigController();

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', (req, res) => controller.getAll(req, res));
router.put('/', (req, res) => controller.update(req, res));

export default router;
