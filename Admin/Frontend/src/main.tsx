import {
  BannersPage,
  CategoriesPage,
  CustomersPage,
  DashboardPage,
  InventoryPage,
  OrderDetailPage,
  OrdersPage,
  ProductEditorPage,
  ProductsPage,
  StaffApp,
  type NavSection,
} from '@ecommerce/web';
import type { AdminPermission } from '@ecommerce/shared';
import { Boxes, GalleryHorizontal, LayoutDashboard, Package, PackagePlus, ShoppingBag, Tags, Users } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import './index.css';

const CATALOG: AdminPermission[] = ['products.manage', 'prices.manage', 'inventory.manage'];

/** Nav follows the signed-in admin's permissions; the Admin backend enforces them on every request. */
const SECTIONS: NavSection[] = [
  { title: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Catalogue',
    items: [
      { to: '/products', label: 'Products', icon: Package, end: true, permissions: CATALOG },
      { to: '/products/new', label: 'Add product', icon: PackagePlus, permissions: ['products.manage'] },
      { to: '/categories', label: 'Categories', icon: Tags, permissions: ['categories.manage'] },
      { to: '/inventory', label: 'Inventory', icon: Boxes, permissions: ['inventory.manage', 'analytics.view'] },
    ],
  },
  {
    title: 'Sales',
    items: [
      { to: '/orders', label: 'Orders', icon: ShoppingBag, permissions: ['orders.manage'] },
      { to: '/customers', label: 'Customers', icon: Users, permissions: ['customers.view'] },
    ],
  },
  { title: 'Storefront', items: [{ to: '/banners', label: 'Banners', icon: GalleryHorizontal, permissions: ['banners.manage'] }] },
];

createRoot(document.getElementById('root')!).render(
  <StaffApp
    appName="Admin"
    allowedRoles={['admin', 'super_admin']}
    sections={SECTIONS}
    routes={[
      { index: true, element: <DashboardPage /> },
      { path: 'products', element: <ProductsPage />, permissions: CATALOG },
      { path: 'products/:id', element: <ProductEditorPage />, permissions: CATALOG },
      { path: 'categories', element: <CategoriesPage />, permissions: ['categories.manage', 'products.manage'] },
      { path: 'inventory', element: <InventoryPage />, permissions: ['inventory.manage', 'analytics.view'] },
      { path: 'orders', element: <OrdersPage />, permissions: ['orders.manage'] },
      { path: 'orders/:id', element: <OrderDetailPage />, permissions: ['orders.manage'] },
      { path: 'customers', element: <CustomersPage />, permissions: ['customers.view'] },
      { path: 'banners', element: <BannersPage />, permissions: ['banners.manage'] },
    ]}
  />,
);
