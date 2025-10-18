import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { onAuthStateChanged } from 'firebase/auth';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private auth: Auth, private firestore: Firestore, private router: Router) {}

  canActivate(): Promise<boolean> {
    return new Promise((resolve) => {
      // Espera a que Firebase Auth cargue el usuario actual
      onAuthStateChanged(this.auth, async (user) => {
        if (user) {
          try {
            const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
            if (userDoc.exists() && userDoc.data()['role'] === 'admin') {
              resolve(true);
              return;
            }
          } catch (error) {
            console.error('Error verificando rol admin:', error);
          }
        }

        this.router.navigate(['/profile']);
        resolve(false);
      });
    });
  }
}
