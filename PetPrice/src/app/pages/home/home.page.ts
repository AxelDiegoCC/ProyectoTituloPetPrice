import { Component, OnDestroy } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore, collection, getDocs, query, orderBy as fbOrderBy, limit as fbLimit,
  doc, getDoc, DocumentData, onSnapshot, setDoc, deleteDoc, serverTimestamp,
  CollectionReference, QuerySnapshot
} from '@angular/fire/firestore';
import { onAuthStateChanged } from 'firebase/auth';

type Prod = {
  id: string;
  nombre: string;
  marca: string;
  imagen: string;
  priceNumber: number;
  priceLabel: string;
  last_updated?: string;
};

type Tab = 'home' | 'explore' | 'favorites' | 'profile';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class HomePage implements OnDestroy {
  // Tabs
  activeTab: Tab = 'home';

  searchTerm = '';

  // “Mejores precios hoy”
  bestProducts: Prod[] = [];

  // Búsqueda en header
  allForSearch: Prod[] = [];
  searchResults: Prod[] = [];
  searchOpen = false;
  searchCount = 0;

  // Login state → controla visibilidad de corazón
  isLoggedIn = false;

  // Favoritos (ids en vivo)
  favIds = new Set<string>();
  private unsubFavs?: () => void;

  private searchTimer?: any;
  private offAuth?: () => void;

  constructor(
    private router: Router,
    private auth: Auth,
    private firestore: Firestore,
    private toast: ToastController
  ) {}

  ionViewWillEnter() {
    this.activeTab = 'home';

    // Estado inicial
    this.isLoggedIn = !!this.auth.currentUser;

    // Escuchar cambios de auth (login/logout)
    if (!this.offAuth) {
      this.offAuth = onAuthStateChanged(this.auth, (u) => {
        this.isLoggedIn = !!u;
        this.startFavsWatcher(); // re-suscribe según usuario actual
      });
    }

    this.loadBestProducts();
    this.preloadProductsForSearch();
    this.startFavsWatcher(); // solo si hay usuario
  }

  ngOnDestroy(): void {
    if (this.unsubFavs) this.unsubFavs();
    if (this.offAuth) this.offAuth();
  }

  // ====== Data shape helper ======
  private mapProduct(id: string, data: any): Prod {
    const priceNumber = Number(data?.precio_minimo ?? 0) || 0;
    const priceLabel = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(priceNumber);
    return {
      id,
      nombre: data?.nombre || '',
      marca: data?.marca || '',
      imagen: data?.imagen || '',
      priceNumber,
      priceLabel,
      last_updated: data?.last_updated
    };
  }

  // ====== Top 4 recientes ======
  private async loadBestProducts() {
    try {
      const ref = collection(this.firestore, 'products');
      const q = query(ref, fbOrderBy('last_updated', 'desc'), fbLimit(4));
      const snap = await getDocs(q);

      let list: Prod[] = snap.docs.map(d => this.mapProduct(d.id, d.data() as DocumentData));

      if (!list.length) {
        const snapAll = await getDocs(ref);
        const all = snapAll.docs.map(d => this.mapProduct(d.id, d.data() as DocumentData));
        list = all
          .sort((a, b) => new Date(b.last_updated || 0).getTime() - new Date(a.last_updated || 0).getTime())
          .slice(0, 4);
      }

      this.bestProducts = list;
    } catch (e) {
      console.error('Cargando recientes:', e);
      this.bestProducts = [];
    }
  }

  // ====== Preload para panel de búsqueda ======
  private async preloadProductsForSearch() {
    try {
      const ref = collection(this.firestore, 'products');
      const snap = await getDocs(ref);
      this.allForSearch = snap.docs.map(d => this.mapProduct(d.id, d.data() as DocumentData));
    } catch (e) {
      console.error('Preload búsqueda:', e);
      this.allForSearch = [];
    }
  }

  // ====== Favoritos (suscripción en vivo)
  private startFavsWatcher() {
    // Limpia suscripción previa
    if (this.unsubFavs) { this.unsubFavs(); this.unsubFavs = undefined; }

    const user = this.auth.currentUser;
    if (!user) {
      // no logueado → limpiar IDs
      this.favIds.clear();
      return;
    }

    const col = collection(this.firestore, `users/${user.uid}/favorites`) as CollectionReference<DocumentData>;
    this.unsubFavs = onSnapshot(
      col,
      (snap: QuerySnapshot<DocumentData>) => {
        const next = new Set<string>();
        snap.docs.forEach(d => next.add(d.id));
        this.favIds = next;
      },
      (err) => console.warn('Favs watcher error:', err)
    );
  }

  // ====== Toggle favorito desde Home ======
  async toggleFavorite(p: Prod, ev?: Event) {
    ev?.stopPropagation(); // evitar abrir detalle

    const user = this.auth.currentUser;
    if (!user) {
      (await this.toast.create({ message: 'Inicia sesión para usar favoritos', duration: 1400, position: 'bottom' })).present();
      await this.safeNavigate('/login');
      return;
    }

    const favRef = doc(this.firestore, `users/${user.uid}/favorites/${p.id}`);

    try {
      if (!this.favIds.has(p.id)) {
        // Agregar
        await setDoc(favRef, {
          title: p.nombre || 'Producto',
          price: p.priceNumber ?? 0,
          image: p.imagen || 'assets/img/no-image.png',
          productId: p.id,
          createdAt: serverTimestamp()
        }, { merge: true });

        (await this.toast.create({ message: 'Agregado a favoritos', duration: 1200, position: 'bottom' })).present();
      } else {
        // Quitar
        await deleteDoc(favRef);
        (await this.toast.create({ message: 'Eliminado de favoritos', duration: 1200, position: 'bottom' })).present();
      }
      // UI se actualiza por onSnapshot
    } catch (e) {
      console.error('toggleFavorite:', e);
      (await this.toast.create({ message: 'No se pudo actualizar favorito', duration: 1500, position: 'bottom', color: 'danger' })).present();
    }
  }

  // ====== Search header ======
  onSearchFocus() {
    if (this.searchResults.length) this.searchOpen = true;
  }

  onSearchInput() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      const q = (this.searchTerm || '').trim().toLowerCase();
      if (!q) {
        this.searchResults = [];
        this.searchOpen = false;
        this.searchCount = 0;
        return;
      }

      const filtered = this.allForSearch.filter(p =>
        p.nombre.toLowerCase().includes(q) || p.marca.toLowerCase().includes(q)
      );

      this.searchCount = filtered.length;
      this.searchResults = filtered.slice(0, 8);
      this.searchOpen = this.searchResults.length > 0;
    }, 120);
  }

  doSearch() {
    const q = (this.searchTerm || '').trim();
    this.searchOpen = false;
    this.safeNavigate('/products', q ? { q } : undefined);
  }

  goToSearchPage() { this.doSearch(); }

  // ⬇️ Importante: enviamos state { from: 'home' } para que el back del detalle vuelva a Home
  openProduct(id: string) {
    this.searchOpen = false;
    this.router.navigate(['/product-detail', id], {
      state: { from: 'home' }
    });
  }

  seeAll() { this.safeNavigate('/products'); }

  goToCategory(cat: 'perro' | 'gato') {
    this.safeNavigate('/products', { category: cat });
  }

  // ===== Tabs navigation
  async goToHome()      { this.activeTab = 'home';      await this.safeNavigate('/home'); }
  async goToExplore()   { this.activeTab = 'explore';   await this.safeNavigate('/products'); }
  async goToFavorites() { this.activeTab = 'favorites'; await this.safeNavigate('/favorites'); }
  async goToProfile()   {
    this.activeTab = 'profile';
    const user = this.auth.currentUser;
    if (!user) { await this.safeNavigate('/login'); return; }
    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      await this.safeNavigate(role === 'admin' ? '/admin-panel' : '/profile');
    } catch {
      await this.safeNavigate('/profile');
    }
  }

  // ===== Utils
  private async safeNavigate(target: string, queryParams?: Record<string, any>) {
    const current = this.router.url.split('?')[0].split('#')[0];
    if (current !== target || queryParams) {
      await this.router.navigate([target], queryParams ? { queryParams } : undefined);
    }
  }

  private async toastMsg(message: string) {
    const t = await this.toast.create({ message, duration: 1800, color: 'primary' });
    await t.present();
  }
}
