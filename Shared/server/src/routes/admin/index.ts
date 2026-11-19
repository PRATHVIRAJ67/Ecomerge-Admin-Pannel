import { Router } from 'express';
import { analyticsRouter } from './analytics';
import { bannersRouter, categoriesRouter, uploadsRouter } from './catalog';
import { customersRouter, inventoryRouter, ordersRouter } from './operations';
import { productsRouter } from './products';

/** Mounted behind requireAuth + requireStaff. Each sub-router enforces its own permissions. */
export const adminRouter = Router();

adminRouter.use('/analytics', analyticsRouter);
adminRouter.use('/products', productsRouter);
adminRouter.use('/categories', categoriesRouter);
adminRouter.use('/inventory', inventoryRouter);
adminRouter.use('/orders', ordersRouter);
adminRouter.use('/customers', customersRouter);
adminRouter.use('/banners', bannersRouter);
adminRouter.use('/uploads', uploadsRouter);
