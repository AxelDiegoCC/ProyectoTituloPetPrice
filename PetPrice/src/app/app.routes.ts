import { Routes } from '@angular/router';
import { AdminGuard } from './guards/admin-guard-guard';

export const routes: Routes = [

  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
    {
    path: 'products',
    loadComponent: () => import('./pages/products/products.page').then( m => m.ProductsPage)
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then( m => m.LoginPage)
  },
  {
    path: 'favorites',
    loadComponent: () => import('./pages/favorites/favorites.page').then( m => m.FavoritesPage)
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.page').then( m => m.ProfilePage)
  },
  {
    path: 'createaccount',
    loadComponent: () => import('./pages/createaccount/createaccount.page').then( m => m.CreateaccountPage)
  },
  {
    path: 'changepassword',
    loadComponent: () => import('./pages/changepassword/changepassword.page').then( m => m.ChangepasswordPage)
  },
  {
    path: 'admin-panel',
    loadComponent: () => import('./pages/admin-panel/admin-panel.page').then( m => m.AdminPanelPage), canActivate: [AdminGuard]
  },
  {
    path: 'product-detail/:id',
    loadComponent: () => import('./pages/product-detail/product-detail.page').then( m => m.ProductDetailPage)
  },
  {
    path: 'admin-users-panel',
    loadComponent: () => import('./pages/admin-users-panel/admin-users-panel.page').then( m => m.AdminUsersPanelPage)
  },
  {
    path: 'admin-products-panel',
    loadComponent: () => import('./pages/admin-products-panel/admin-products-panel.page').then( m => m.AdminProductsPanelPage)
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then( m => m.HomePage)
  },
  {
    path: 'configurations',
    loadComponent: () => import('./pages/configurations/configurations.page').then( m => m.ConfigurationsPage)
  },
];
