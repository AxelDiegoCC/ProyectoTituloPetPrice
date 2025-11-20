import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule, CurrencyPipe, NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  CollectionReference,
  QuerySnapshot,
  DocumentData
} from '@angular/fire/firestore';

type Tab = 'home' | 'explore' | 'favorites' | 'profile';

interface FavoriteItem {
  id: string;
  title: string;
  image: string;
  brand: string;
  price: number;
  tiendasCount: number;
  ratingAvg: number;
  ratingCount: number;
  isFav: boolean;
}

@Component({
  selector: 'app-favorites',
  standalone: true,
  templateUrl: './favorites.page.html',
  styleUrls: ['./favorites.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule, NgIf, NgFor, CurrencyPipe]
})
export class FavoritesPage implements OnInit, OnDestroy {
  activeTab: Tab = 'favorites';
  favorites: FavoriteItem[] = [];
  private unsub?: () => void;

  constructor(
    private router: Router,
    private auth: Auth,
    private firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private toast: ToastController
  ) {}

  ngOnInit() {}

  ionViewWillEnter() {
    this.activeTab = 'favorites';

    const user = this.auth.currentUser;
    if (!user) {
      this.redirectToLogin('/favorites');  // ⬅️ evita dejar /favorites en el historial
      return;
    }

    const col = collection(this.firestore, `users/${user.uid}/favorites`) as CollectionReference<DocumentData>;
    if (this.unsub) this.unsub();

    this.unsub = onSnapshot(col, async (snap: QuerySnapshot<DocumentData>) => {
      const base = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title || '',
          image: data.image || '',
          brand: data.brand || '',
          price: Number(data.price ?? 0),
          tiendasCount: 0,
          ratingAvg: 0,
          ratingCount: 0,
          isFav: true
        } as FavoriteItem;
      });

      const enriched = await this.enrichFavorites(base);
      this.favorites = enriched;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.unsub) this.unsub();
  }

  private async enrichFavorites(items: FavoriteItem[]): Promise<FavoriteItem[]> {
    return await Promise.all(items.map(async (it) => {
      try {
        const pSnap = await getDoc(doc(this.firestore, 'products', it.id));
        if (pSnap.exists()) {
          const p = pSnap.data() as any;

          const precioNumber = Number(p?.precio_minimo ?? it.price) || it.price || 0;
          const tiendasCount = p?.precios ? Object.keys(p.precios).length : it.tiendasCount || 0;

          let ratingAvg = 0, ratingCount = 0;
          try {
            const rSnap = await getDocs(collection(this.firestore, `products/${it.id}/reviews`));
            let sum = 0;
            rSnap.forEach(r => {
              const rd = r.data() as any;
              const rating = Number(rd.rating || 0);
              if (rating > 0) { sum += rating; ratingCount++; }
            });
            ratingAvg = ratingCount ? (sum / ratingCount) : 0;
          } catch { /* ignore */ }

          return {
            ...it,
            title: p?.nombre || it.title,
            brand: (p?.marca || it.brand || '').toString(),
            price: precioNumber,
            tiendasCount,
            ratingAvg,
            ratingCount
          };
        }
      } catch { /* ignore */ }
      return it;
    }));
  }

  starName(avg: number, index: number): 'star' | 'star-half' | 'star-outline' {
    if (avg >= index) return 'star';
    if (avg >= index - 0.5) return 'star-half';
    return 'star-outline';
  }

  // ===== Navegación tabs =====
  async goToHome()      { this.activeTab = 'home';      await this.safeNavigate('/home'); }
  async goToExplore()   { this.activeTab = 'explore';   await this.safeNavigate('/products'); }
  async goToFavorites() { this.activeTab = 'favorites'; this.cdr.detectChanges(); }

  async goToProfile() {
    const user = this.auth.currentUser;
    if (!user) { await this.redirectToLogin('/profile'); return; } // ⬅️ usa replaceUrl y returnUrl
    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      const target = role === 'admin' ? '/admin-panel' : '/profile';
      await this.safeNavigate(target);
      this.activeTab = 'profile';
      this.cdr.detectChanges();
    } catch {
      await this.safeNavigate('/profile');
      this.activeTab = 'profile';
      this.cdr.detectChanges();
    }
  }

  // ===== Acciones =====
  async openProduct(item: FavoriteItem) {
    await this.router.navigate(['/product-detail', item.id], {
      state: { from: 'favorites' }
    });
  }

  async toggleFavorite(item: FavoriteItem) {
    const user = this.auth.currentUser;
    if (!user) { await this.redirectToLogin('/favorites'); return; } // ⬅️ aquí también
    await deleteDoc(doc(this.firestore, `users/${user.uid}/favorites/${item.id}`));
    (await this.toast.create({
      message: 'Eliminado de favoritos',
      duration: 1200,
      position: 'bottom'
    })).present();
  }

  // ===== Helpers =====
  trackById(_: number, item: FavoriteItem) { return item.id; }

  private async safeNavigate(target: string) {
    const current = this.router.url.split('?')[0].split('#')[0];
    if (current !== target) await this.router.navigate([target]);
  }

  // 🔑 Redirige a login sin dejar la página anterior en el historial
  private async redirectToLogin(returnUrl: string) {
    await this.router.navigate(['/login'], {
      replaceUrl: true,                 // <-- clave para romper el bucle de back
      queryParams: { returnUrl }        // <-- para volver post-login
    });
  }
}
