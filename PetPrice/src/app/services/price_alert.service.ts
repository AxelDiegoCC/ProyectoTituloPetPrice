import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, getDocs, doc, getDoc, updateDoc, setDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class PriceAlertService {
  constructor(
    private auth: Auth,
    private firestore: Firestore
  ) {}

  // Revisa si los productos favoritos bajaron de precio
  async checkPriceDrops() {
    const user = this.auth.currentUser;
    if (!user) return;

    const favSnap = await getDocs(collection(this.firestore, `users/${user.uid}/favorites`));

    for (const favDoc of favSnap.docs) {
      const favData = favDoc.data() as any;
      const productId = favDoc.id;

      // Datos actuales del producto
      const pSnap = await getDoc(doc(this.firestore, 'products', productId));
      if (!pSnap.exists()) continue;

      const pData = pSnap.data() as any;
      const currentPrice = Number(pData?.precio_minimo ?? 0);
      const previousPrice = Number(favData?.price ?? 0);

      // Si nunca guardaste price en el favorito, inicialízalo y sigue
      if (!previousPrice || previousPrice <= 0) {
        await this.safeUpdateFavoritePrice(user.uid, productId, currentPrice);
        continue;
      }

      // Si bajó de precio → notifica y actualiza
      if (Number.isFinite(currentPrice) && currentPrice > 0 && currentPrice < previousPrice) {
        await this.showPriceDropNotification(productId, favData.title, previousPrice, currentPrice);
        await this.safeUpdateFavoritePrice(user.uid, productId, currentPrice);
      }
    }
  }

  private async safeUpdateFavoritePrice(uid: string, productId: string, newPrice: number) {
    try {
      await updateDoc(doc(this.firestore, `users/${uid}/favorites/${productId}`), {
        price: newPrice,
        updatedAt: Date.now()
      });
    } catch {
      // Si el doc no existe (raro), haz set:
      await setDoc(doc(this.firestore, `users/${uid}/favorites/${productId}`), {
        price: newPrice,
        updatedAt: Date.now()
      }, { merge: true });
    }
  }

  // Notificación local con productId en extra (para abrir detalle al tocarla)
  private async showPriceDropNotification(productId: string, title: string, oldPrice: number, newPrice: number) {
    const clp = (v: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 100000),
          title: '¡Precio rebajado!',
          body: `${title} bajó de ${clp(oldPrice)} a ${clp(newPrice)}`,
          schedule: { at: new Date(Date.now() + 500) },
          extra: { productId }               // 👈 clave para deep link
          // smallIcon: 'ic_stat_name',      // opcional Android
          // channelId: 'price-updates',     // si creaste canal
        }
      ]
    });
  }
}
