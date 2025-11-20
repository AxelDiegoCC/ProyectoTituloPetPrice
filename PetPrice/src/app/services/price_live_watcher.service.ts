// src/app/services/price_live_watcher.service.ts
import { Injectable } from '@angular/core';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import {
  Firestore, collection, onSnapshot, doc, onSnapshot as onDocSnapshot,
  getDocs, updateDoc
} from '@angular/fire/firestore';
import { LocalNotifications } from '@capacitor/local-notifications';

@Injectable({ providedIn: 'root' })
export class PriceLiveWatcherService {
  private favUnsub?: () => void;
  private productUnsubs = new Map<string, () => void>();
  private lastSeen = new Map<string, number>(); // productId -> last precio_minimo

  constructor(private auth: Auth, private db: Firestore) {}

  start() {
    if (!this.auth.currentUser) return;
    const uid = this.auth.currentUser.uid;

    // Limpia previas
    this.stop();

    // Suscríbete a favoritos del usuario
    const favCol = collection(this.db, `users/${uid}/favorites`);
    this.favUnsub = onSnapshot(favCol, async snap => {
      // Desuscribe productos que ya no están
      const currentIds = new Set(snap.docs.map(d => d.id));
      for (const [pid, unsub] of this.productUnsubs) {
        if (!currentIds.has(pid)) { unsub(); this.productUnsubs.delete(pid); this.lastSeen.delete(pid); }
      }

      // Crea/actualiza suscripciones a cada producto favorito
      snap.docs.forEach(d => {
        const productId = d.id;
        if (this.productUnsubs.has(productId)) return; // ya suscrito

        const pRef = doc(this.db, 'products', productId);
        const unsub = onDocSnapshot(pRef, async pSnap => {
          if (!pSnap.exists()) return;
          const data = pSnap.data() as any;
          const currentPrice = Number(data?.precio_minimo ?? 0);

          const prev = this.lastSeen.get(productId);
          if (prev === undefined) {
            // primera vez: memoriza y no notifiques (para evitar ruido al conectar)
            this.lastSeen.set(productId, currentPrice);
            return;
          }

          if (Number.isFinite(currentPrice) && currentPrice > 0 && currentPrice !== prev) {
            const diff = currentPrice - prev;
            const direction = diff < 0 ? 'bajó' : 'subió';
            // Notificación local
            await LocalNotifications.schedule({
              notifications: [{
                id: Math.floor(Math.random() * 100000),
                title: `Precio ${direction}`,
                body: `Este producto ${direction} de ${this.clp(prev)} a ${this.clp(currentPrice)}`,
                schedule: { at: new Date(Date.now() + 300) },
                extra: { productId }
              }]
            });
            this.lastSeen.set(productId, currentPrice);

            // (Opcional) sincroniza el nuevo price en el favorito del usuario
            const favRef = doc(this.db, `users/${uid}/favorites/${productId}`);
            try { await updateDoc(favRef, { price: currentPrice, updatedAt: Date.now() }); } catch {}
          }
        });

        this.productUnsubs.set(productId, unsub);
      });
    });
  }

  stop() {
    if (this.favUnsub) { this.favUnsub(); this.favUnsub = undefined; }
    for (const [, unsub] of this.productUnsubs) unsub();
    this.productUnsubs.clear();
    this.lastSeen.clear();
  }

  private clp(v: number) {
    return new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 }).format(v);
  }
}
